import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

// 전역 상태 변수
let activeOfficePanel: vscode.WebviewPanel | undefined;
let sidebarWebview: vscode.Webview | undefined;
let currentLlmModel: string = "local-model";

function getOpenAIClient() {
    const config = vscode.workspace.getConfiguration('myAgentExt');
    const endpoint = config.get<string>('llmEndpoint') || 'http://127.0.0.1:1234/v1';
    return new OpenAI({
        baseURL: endpoint,
        apiKey: 'not-needed'
    });
}

// 브로드캐스트 (양쪽 웹뷰에 동시 전송)
function broadcastMessage(message: any) {
    if (sidebarWebview) {
        sidebarWebview.postMessage(message);
    }
    if (activeOfficePanel) {
        activeOfficePanel.webview.postMessage(message);
    }
}

function getAvailableAgents(context: vscode.ExtensionContext): string[] {
    const agents = new Set<string>();
    
    // 1. 내장 에이전트 스캔
    const internalPath = path.join(context.extensionPath, 'agents');
    if (fs.existsSync(internalPath)) {
        fs.readdirSync(internalPath).forEach(file => {
            if (fs.statSync(path.join(internalPath, file)).isDirectory()) {
                agents.add(file);
            }
        });
    }

    // 2. 사용자 커스텀 에이전트 스캔
    const config = vscode.workspace.getConfiguration('myAgentExt');
    const workspacePath = config.get<string>('workspacePath');
    if (workspacePath) {
        const customPath = path.join(workspacePath, '_agents');
        if (fs.existsSync(customPath)) {
            fs.readdirSync(customPath).forEach(file => {
                if (fs.statSync(path.join(customPath, file)).isDirectory()) {
                    agents.add(file);
                }
            });
        }
    }

    return Array.from(agents);
}

async function sendStatusUpdate(context?: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('myAgentExt');
    const workspacePath = config.get<string>('workspacePath') || '기본 내장 폴더 (설정되지 않음)';
    
    const endpoint = config.get<string>('llmEndpoint') || 'http://127.0.0.1:1234/v1';
    
    let llmStatus = '🔴 오프라인';
    let availableModels: string[] = [];

    try {
        const client = getOpenAIClient();
        const models = await client.models.list();
        if (models.data && models.data.length > 0) {
            llmStatus = '🟢 연결됨';
            availableModels = models.data.map(m => m.id);
            if (!availableModels.includes(currentLlmModel)) {
                currentLlmModel = availableModels[0];
            }
        } else {
            llmStatus = '🟡 모델 없음';
        }
    } catch (e) {
        llmStatus = '🔴 오프라인';
    }

    const availableAgents = context ? getAvailableAgents(context) : [];

    broadcastMessage({ 
        command: "updateStatus", 
        llmStatus: llmStatus, 
        currentModel: currentLlmModel,
        availableModels: availableModels,
        workspacePath: workspacePath,
        llmEndpoint: endpoint,
        availableAgents: availableAgents
    });
}

async function getAgentCapabilities(context: vscode.ExtensionContext): Promise<string> {
    const config = vscode.workspace.getConfiguration('myAgentExt');
    const workspacePath = config.get<string>('workspacePath');
    const agentIds = getAvailableAgents(context);
    
    let capabilities = "";
    for (const id of agentIds) {
        if (id === 'ceo') continue; // CEO 자신은 제외
        
        let goalPath = path.join(context.extensionPath, 'agents', id, 'goal.md');
        if (workspacePath && fs.existsSync(path.join(workspacePath, '_agents', id, 'goal.md'))) {
            goalPath = path.join(workspacePath, '_agents', id, 'goal.md');
        }

        let goal = "설명 없음";
        if (fs.existsSync(goalPath)) {
            goal = fs.readFileSync(goalPath, 'utf8').substring(0, 200);
        }
        capabilities += `- 에이전트ID: ${id}\n  전문분야/목표: ${goal}\n\n`;
    }
    return capabilities;
}

async function runAgent(agentName: string, userMessage: string, context: vscode.ExtensionContext): Promise<string> {
    broadcastMessage({ agent: agentName, status: "typing" });

    const config = vscode.workspace.getConfiguration('myAgentExt');
    const workspacePath = config.get<string>('workspacePath') || '';

    let promptPath = path.join(context.extensionPath, 'agents', agentName, 'prompt.md');
    
    // Override: 사용자 지정 지식 공간에 해당 에이전트가 존재하면 우선 사용
    if (workspacePath && fs.existsSync(path.join(workspacePath, '_agents', agentName, 'prompt.md'))) {
        promptPath = path.join(workspacePath, '_agents', agentName, 'prompt.md');
        console.log(`[Override] 커스텀 지식 공간 사용: ${promptPath}`);
    }

    let systemInstruction = "당신은 AI 에이전트입니다.";
    try {
        const personaPrompt = fs.readFileSync(promptPath, 'utf8');
        systemInstruction = `당신은 다음의 페르소나를 가진 AI 에이전트입니다.\n${personaPrompt}`;
    } catch (e) {
        console.error(`프롬프트 파일을 찾을 수 없습니다: ${promptPath}`);
    }

    try {
        const client = getOpenAIClient();
        const response = await client.chat.completions.create({
            model: currentLlmModel,
            messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: userMessage }
            ],
            temperature: 0.7
        });

        broadcastMessage({ agent: agentName, status: "idle" });
        return response.choices[0].message.content || "";
    } catch (error) {
        console.error(error);
        broadcastMessage({ agent: agentName, status: "idle" });
        return `[에러 발생] LLM 통신 실패`;
    }
}

class AgentViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly _context: vscode.ExtensionContext) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = { enableScripts: true };
        sidebarWebview = webviewView.webview; // 전역 변수에 저장
        
        const htmlPath = path.join(this._context.extensionPath, 'sidebar.html');
        try {
            webviewView.webview.html = fs.readFileSync(htmlPath, 'utf8');
            // 웹뷰가 로드될 시간을 약간 준 뒤 상태 정보 전송
            setTimeout(() => sendStatusUpdate(this._context), 500);
        } catch (error) {
            vscode.window.showErrorMessage('사이드바 HTML 파일을 찾을 수 없습니다.');
            return;
        }

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'openOffice':
                    // 메인 창 열기 커맨드 실행
                    vscode.commands.executeCommand('my-agent-ext.openDashboard');
                    return;
                case 'setWorkspace':
                    // 지식 공간 설정 커맨드 실행
                    vscode.commands.executeCommand('my-agent-ext.setWorkspace');
                    return;
                case 'changeModel':
                    if (message.model) {
                        currentLlmModel = message.model;
                        vscode.window.showInformationMessage(`LLM 모델이 [ ${currentLlmModel} ] 로 변경되었습니다.`);
                    }
                    return;
                case 'changeEndpoint':
                    if (message.endpoint) {
                        await vscode.workspace.getConfiguration('myAgentExt').update('llmEndpoint', message.endpoint, vscode.ConfigurationTarget.Global);
                        vscode.window.showInformationMessage(`서버 주소가 변경되었습니다: ${message.endpoint}`);
                        sendStatusUpdate(this._context);
                    }
                    return;
                case 'createAgent':
                    vscode.commands.executeCommand('my-agent-ext.createAgent');
                    return;
                case 'deleteAgent':
                    if (message.agent) {
                        vscode.commands.executeCommand('my-agent-ext.deleteAgent', message.agent);
                    }
                    return;
                case 'runSingleAgent':
                    if (message.agent && message.topic) {
                        broadcastMessage({ message: `[${message.agent}] 에게 지시를 내립니다...` });
                        const result = await runAgent(message.agent, message.topic, this._context);
                        broadcastMessage({ message: `[${message.agent}] 작업 완료!`, result: result });
                    }
                    return;
                case 'startPipeline':
                    const topic = message.topic;
                    broadcastMessage({ message: "🚀 CEO가 업무 분석을 시작합니다..." });

                    const capabilities = await getAgentCapabilities(this._context);
                    const ceoRequest = `현재 가용한 에이전트 목록과 능력:\n${capabilities}\n\n사용자 요청: ${topic}\n\n위 요청을 해결하기 위한 작업 계획을 수립해줘.`;
                    
                    const ceoResponse = await runAgent("ceo", ceoRequest, this._context);
                    
                    try {
                        // JSON만 추출 (마크다운 블록 제거 등)
                        const jsonMatch = ceoResponse.match(/\[[\s\S]*\]/);
                        if (!jsonMatch) throw new Error("JSON 형식을 찾을 수 없습니다.");
                        
                        const plan = JSON.parse(jsonMatch[0]);
                        broadcastMessage({ message: `📋 CEO 작업 계획 수립 완료: ${plan.length}개 작업 할당.` });

                        let finalResult = "";
                        for (const step of plan) {
                            broadcastMessage({ message: `➡️ [${step.agent}] 실행 중: ${step.task}` });
                            const stepResult = await runAgent(step.agent, step.task, this._context);
                            finalResult += `\n\n### [${step.agent}] 결과\n${stepResult}`;
                        }

                        broadcastMessage({ message: "✅ 모든 에이전트 협업 완료!", result: finalResult });
                    } catch (e) {
                        console.error("CEO 응답 파싱 실패:", ceoResponse);
                        broadcastMessage({ message: "❌ CEO의 계획 수립 실패 (형식 오류). 대신 기본 파이프라인을 시도합니다." });
                        
                        // 폴백: 예전 하드코딩 파이프라인
                        const [tResult, cResult] = await Promise.all([
                            runAgent("theory_teacher", `설명: ${topic}`, this._context),
                            runAgent("code_mark", `코드: ${topic}`, this._context)
                        ]);
                        const sResult = await runAgent("study_buddy", `${tResult}\n${cResult}`, this._context);
                        broadcastMessage({ message: "기본 파이프라인 완료", result: sResult });
                    }
                    return;
            }
        });
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('"my-agent-ext" 익스텐션이 실행되었습니다!');

    const provider = new AgentViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('my-agent-sidebar.view', provider)
    );

    let disposable = vscode.commands.registerCommand('my-agent-ext.openDashboard', () => {
        // 이미 열려있으면 포커스만 이동
        if (activeOfficePanel) {
            activeOfficePanel.reveal();
            return;
        }

        // 새 창(메인 패널) 생성
        activeOfficePanel = vscode.window.createWebviewPanel(
            'agentDashboard',
            '🏢 AI 가상 사무실',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        const htmlPath = path.join(context.extensionPath, 'office.html');
        try {
            activeOfficePanel.webview.html = fs.readFileSync(htmlPath, 'utf8');
            // 패널이 로드된 후 상태 정보를 즉시 전송하여 에이전트 목록을 채움
            setTimeout(() => sendStatusUpdate(context), 500);
        } catch (error) {
            vscode.window.showErrorMessage('가상 사무실 HTML 파일을 찾을 수 없습니다.');
        }

        // 창이 닫히면 전역 변수 초기화
        activeOfficePanel.onDidDispose(() => {
            activeOfficePanel = undefined;
        });
    });

    context.subscriptions.push(disposable);

    // 지식 공간 폴더 설정 커맨드 등록
    let setWorkspaceDisposable = vscode.commands.registerCommand('my-agent-ext.setWorkspace', async () => {
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: '지식 공간 폴더 선택'
        });

        if (folderUri && folderUri[0]) {
            const folderPath = folderUri[0].fsPath;
            // Global Settings에 경로 저장
            await vscode.workspace.getConfiguration('myAgentExt').update('workspacePath', folderPath, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`지식 공간이 설정되었습니다: ${folderPath}`);
            sendStatusUpdate(context);
        }
    });

    context.subscriptions.push(setWorkspaceDisposable);

    // 새 에이전트 생성 커맨드 등록
    let createAgentDisposable = vscode.commands.registerCommand('my-agent-ext.createAgent', async () => {
        const config = vscode.workspace.getConfiguration('myAgentExt');
        const workspacePath = config.get<string>('workspacePath');

        if (!workspacePath) {
            vscode.window.showErrorMessage('먼저 지식 공간(Vault) 폴더를 설정해야 합니다.');
            return;
        }

        const agentName = await vscode.window.showInputBox({ 
            prompt: '새 에이전트의 ID를 입력하세요 (영문 소문자/언더바 추천)',
            placeHolder: '예: sql_expert'
        });
        if (!agentName) return;

        const persona = await vscode.window.showInputBox({ 
            prompt: '에이전트의 페르소나(Persona)를 입력하세요',
            placeHolder: '예: 너는 최고의 SQL 전문가야.'
        });
        if (!persona) return;

        const goal = await vscode.window.showInputBox({ 
            prompt: '에이전트의 목표(Goal)를 입력하세요',
            placeHolder: '예: 사용자의 질문을 분석하여 최적의 쿼리를 생성한다.'
        });
        if (!goal) return;

        const agentFolderPath = path.join(workspacePath, '_agents', agentName);
        try {
            if (!fs.existsSync(agentFolderPath)) {
                fs.mkdirSync(agentFolderPath, { recursive: true });
            }
            fs.writeFileSync(path.join(agentFolderPath, 'prompt.md'), persona, 'utf8');
            fs.writeFileSync(path.join(agentFolderPath, 'goal.md'), goal, 'utf8');
            vscode.window.showInformationMessage(`에이전트 '${agentName}' 가 생성되었습니다!`);
            sendStatusUpdate(context);
        } catch (e: any) {
            vscode.window.showErrorMessage(`에이전트 생성 실패: ${e.message}`);
        }
    });

    context.subscriptions.push(createAgentDisposable);

    // 에이전트 삭제 커맨드 등록
    let deleteAgentDisposable = vscode.commands.registerCommand('my-agent-ext.deleteAgent', async (agentName: string) => {
        const config = vscode.workspace.getConfiguration('myAgentExt');
        const workspacePath = config.get<string>('workspacePath');

        if (!workspacePath) return;

        // 내장 에이전트 보호
        const internalAgents = ['theory_teacher', 'code_mark', 'study_buddy', 'ceo'];
        if (internalAgents.includes(agentName)) {
            vscode.window.showErrorMessage(`'${agentName}'은 내장 에이전트이므로 삭제할 수 없습니다.`);
            return;
        }

        const agentFolderPath = path.join(workspacePath, '_agents', agentName);
        if (!fs.existsSync(agentFolderPath)) {
            vscode.window.showErrorMessage('해당 커스텀 에이전트 폴더를 찾을 수 없습니다.');
            return;
        }

        // VS Code 내장 경고창으로 확인
        const answer = await vscode.window.showWarningMessage(
            `에이전트 [${agentName}]를 정말로 삭제하시겠습니까? 모든 설정 파일이 영구 삭제됩니다.`,
            { modal: true },
            '삭제'
        );

        if (answer === '삭제') {
            try {
                fs.rmSync(agentFolderPath, { recursive: true, force: true });
                vscode.window.showInformationMessage(`에이전트 '${agentName}' 가 삭제되었습니다.`);
                sendStatusUpdate(context);
            } catch (e: any) {
                vscode.window.showErrorMessage(`삭제 실패: ${e.message}`);
            }
        }
    });

    context.subscriptions.push(deleteAgentDisposable);
}

export function deactivate() {}

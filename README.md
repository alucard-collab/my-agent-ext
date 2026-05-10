# 🤖 AI Agent Orchestrator: VS Code Extension

> **로컬 LLM과 연동하는 강력한 멀티 에이전트 협업 시스템**  
> 사용자의 요청을 분석하고 최적의 전문가를 배분하는 지능형 오케스트레이션 대시보드입니다.

---

## 🌟 주요 특징 (Key Features)

### 1. 🧠 CEO 기반 에이전트 오케스트레이션
- 사용자의 모호한 요청을 CEO 에이전트가 분석합니다.
- 가용한 에이전트(내장 + 커스텀)의 전문 분야를 파악하여 최적의 작업 계획(Plan)을 수립합니다.
- 선정된 전문가들이 순차적으로 협업하여 최종 결과물을 만들어냅니다.

### 2. 🏢 실시간 가상 사무실 (Kanban UI)
- 에이전트들의 작업 상태(To-Do, Doing, Done)를 현대적인 칸반 보드 UI에서 실시간으로 확인할 수 있습니다.
- 유리질(Glassmorphism) 디자인과 애니메이션을 통해 직관적인 모니터링이 가능합니다.

### 3. 🌐 자유로운 LLM 서버 연동
- **LM Studio**, **Ollama** 등 모든 로컬 AI 서버와 즉시 연동 가능합니다.
- 사이드바 대시보드에서 서버 주소와 모델명을 실시간으로 스위칭할 수 있습니다.

### 4. 📁 사용자 정의 지식 공간 (Override & Custom)
- 본인의 **Obsidian Vault**나 로컬 폴더를 지식 공간으로 지정할 수 있습니다.
- 새로운 에이전트를 즉석에서 생성하고, 그들의 페르소나(`prompt.md`)와 목표(`goal.md`)를 사용자의 로컬 디렉토리에 저장하여 관리합니다.

---

## 🛠️ 기술 스택 (Tech Stack)

- **Language**: TypeScript
- **Frontend**: Vanilla HTML/CSS, JavaScript (Webview API)
- **Backend**: Node.js, VS Code API
- **LLM Client**: OpenAI Node SDK (Local Endpoint 연동)

---

## 🚀 시작하기 (Getting Started)

### 사전 준비 사항
- [Node.js](https://nodejs.org/) 설치
- 로컬 AI 서버 가동 (LM Studio 또는 Ollama)

### 설치 및 빌드 (Installation & Build)
1. 저장소를 클론합니다.
   ```bash
   git clone https://github.com/alucard-collab/my-agent-ext.git
   cd my-agent-ext
   ```

2. 의존성 패키지를 설치합니다.
   ```bash
   npm install
   ```

3. 코드를 컴파일합니다.
   ```bash
   npm run compile
   ```

### 실행 및 디버깅 (Run & Debug)
1. VS Code에서 프로젝트를 엽니다.
2. `F5` 키를 눌러 **Extension Development Host** 창을 띄웁니다.
3. 사이드바의 **My AI Agent** 아이콘을 클릭하여 대시보드를 엽니다.
4. "지식 공간" 설정을 통해 본인의 작업 폴더를 선택한 후 사용을 시작하세요!

---

## 📂 프로젝트 구조 (Structure)

- `src/extension.ts`: 익스텐션 핵심 비즈니스 로직 및 이벤트 핸들링
- `sidebar.html`: 사이드바 컨트롤 패널 UI
- `office.html`: 칸반 보드 가상 사무실 UI
- `agents/`: 기본 내장 에이전트 프롬프트 및 목표 설정
- `package.json`: 익스텐션 설정 및 커맨드 정의

---

## 📝 라이선스
MIT License. 자유롭게 수정하고 발전시켜 주세요!

이 익스텐션은 나만의 1인 기업 AI 사무실을 제공합니다.
대시보드를 통해 다수의 AI 에이전트(이론 선생님, 개발자 마크, 조이 조교)에게 작업을 지시하고, 결과를 받아볼 수 있습니다.

## 사용 방법
1. 명령어 팔레트(`Ctrl+Shift+P`)에서 `My Agent: 열기`를 실행하세요.
2. 팝업된 대시보드에 주제를 입력하고 지시하기 버튼을 누르세요.
3. 에이전트들이 자동으로 업무를 분담하여 작업합니다.

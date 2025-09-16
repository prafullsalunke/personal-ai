# Personal AI Chat Application

A modern AI-powered chat application with voice-to-text transcription using OpenAI's Whisper API.

## Features

- 🤖 AI-powered chat using OpenAI GPT models
- 🎤 Voice-to-text transcription with Whisper API
- 💬 Real-time streaming responses
- 🎨 Beautiful, responsive UI with Tailwind CSS
- 📱 Mobile-first design
- 🔄 Message queuing and persistence
- ✨ AI-powered prompt improvement

## Setup

1. **Install dependencies:**
   ```bash
   yarn install
   ```

2. **Set up environment variables:**
   Create a `.env.local` file in the root directory:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   ```

3. **Run the development server:**
   ```bash
   yarn dev
   ```

4. **Build for production:**
   ```bash
   yarn build
   ```

## Usage

### Text Chat
- Type your message in the input field
- Press Enter or click the send button
- For longer prompts (100+ characters), use the sparkle button to improve your prompt with AI

### Voice Recording
- Click the microphone button to start recording
- Click the square button to stop recording and transcribe
- The transcribed text will automatically appear in the input field
- You can pause/resume recording during the process

## API Endpoints

- `POST /api/chat` - Chat with AI models
- `POST /api/transcribe` - Transcribe audio using Whisper
- `POST /api/enhance-prompt` - Enhance user prompts for better AI responses

## Technologies Used

- **Frontend:** Next.js 15, React, TypeScript, Tailwind CSS
- **AI:** OpenAI GPT-4, Whisper API
- **Audio:** Web Audio API, MediaRecorder API
- **UI Components:** Lucide React icons, React Markdown

## Browser Support

Voice recording requires a modern browser with support for:
- MediaRecorder API
- getUserMedia API
- Web Audio API

Supported browsers: Chrome, Firefox, Safari, Edge (latest versions)
# OpenAI API Setup Guide

This guide explains how to set up OpenAI's Whisper and Text-to-Speech APIs for J.A.R.V.I.S.

## Features

- **Speech-to-Text**: OpenAI Whisper Large v3 model for accurate voice transcription
- **Text-to-Speech**: OpenAI TTS for natural voice responses
- **No GPU Required**: Works on any machine with internet connection
- **Free Tier Available**: Whisper and TTS APIs are available on OpenAI's free tier

## Step 1: Get Your OpenAI API Key

1. Visit [OpenAI Platform](https://platform.openai.com)
2. Sign in or create an account
3. Navigate to **API keys** section (https://platform.openai.com/account/api-keys)
4. Click **Create new secret key**
5. Copy the API key and save it securely

## Step 2: Configure Environment Variables

1. Create a `.env.local` file in the project root:
   ```bash
   cp .env.example .env.local
   ```

2. Add your OpenAI API key:
   ```env
   OPENAI_API_KEY=sk-YOUR_API_KEY_HERE
   ```

3. Optional: Configure TTS voice (default is "alloy"):
   ```env
   TTS_VOICE=alloy    # Options: alloy, echo, fable, onyx, nova, shimmer
   ```

4. For LLM responses (optional, uses simulated responses if not set):
   ```env
   NVIDIA_API_KEY=Paste Api Key Here
   ```

## Step 3: Run the Application

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open http://localhost:3000 in your browser

4. Click the microphone button and start speaking!

## How It Works

### Speech Recognition (ASR)
- Audio is captured from your microphone as 16kHz mono PCM WAV
- Sent to OpenAI's Whisper API
- Returns transcribed text

### Agent Response
- Transcribed text is processed by the Hermes agent
- Agent generates a response and controls the 3D core
- Response is sent to Text-to-Speech API

### Text-to-Speech (TTS)
- Agent's response text is sent to OpenAI's TTS API
- Returns audio in MP3 format
- Audio is automatically played through your system speakers

## Available TTS Voices

| Voice | Style | Use Case |
|-------|-------|----------|
| **alloy** | Neutral, balanced | Default, professional |
| **echo** | Slightly robotic | Sci-fi, tech-focused |
| **fable** | Warm, narrative | Storytelling |
| **onyx** | Deep, masculine | Authority, drama |
| **nova** | Energetic, bright | Enthusiastic responses |
| **shimmer** | Clear, pleasant | Friendly, approachable |

## API Costs

- **Whisper**: $0.02 per minute of audio
- **TTS-1**: $0.015 per 1K characters
- **TTS-1 HD**: $0.030 per 1K characters

**Free Trial**: OpenAI provides $5 in free credits for new accounts (valid for 3 months)

## Troubleshooting

### "OpenAI API key not configured"
- Verify `OPENAI_API_KEY` is set in `.env.local`
- Ensure the key starts with `sk-`
- Restart the dev server after updating `.env.local`

### "Whisper API responded with error"
- Check your API key is valid and has sufficient credits
- Verify audio is being captured (check microphone permissions)
- Audio file should be under 25MB

### "TTS endpoint returned error"
- Check API key quota hasn't been exceeded
- Verify text length is reasonable (very long text may fail)
- Try a different voice from the available options

### No audio output
- Check browser speaker volume
- Verify browser hasn't blocked audio autoplay
- Check browser console for playback errors

## Local Fallback Mode

If the `OPENAI_API_KEY` is not set or invalid, J.A.R.V.I.S. will run in **local fallback mode**, showing simulated responses and no audio output. This allows testing the interface without API credentials.

## Integration with Hermes Agent

The agent processes your commands and generates responses using:
- Local pattern matching for intent recognition
- Mock web automation tools for simulated actions
- Optional DiffusionGemma LLM for natural language responses

## Rate Limits

OpenAI has the following rate limits on free tier:
- Whisper: 500 requests per minute
- TTS: 500 requests per minute

For production use, consider upgrading to a paid plan.

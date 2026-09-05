#!/usr/bin/env node
/**
 * Test script to debug NVIDIA ASR API connectivity
 * Run: node test-nvidia-api.js
 */

const fs = require('fs');
const path = require('path');

// Load env variables
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const ASR_URL = process.env.NVIDIA_ASR_URL || "https://ai.nvidia.com/api/v1/audio/transcriptions";
const ASR_MODEL = process.env.NVIDIA_ASR_MODEL || "nvidia/parakeet-ctc-1.1b-asr";
const API_KEY = process.env.NVIDIA_API_KEY;

console.log('🔍 NVIDIA ASR API Test\n');
console.log('Configuration:');
console.log(`  URL: ${ASR_URL}`);
console.log(`  Model: ${ASR_MODEL}`);
console.log(`  API Key: ${API_KEY ? API_KEY.substring(0, 10) + '...' : 'NOT SET'}\n`);

if (!API_KEY) {
  console.error('❌ NVIDIA_API_KEY not set in .env.local');
  process.exit(1);
}

// Create a minimal test audio (silence)
const createMinimalWav = () => {
  const sampleRate = 16000;
  const duration = 1; // 1 second
  const numSamples = sampleRate * duration;
  const audioData = new Int16Array(numSamples);

  // Create WAV file
  const wavHeader = Buffer.alloc(44);
  wavHeader.writeUInt32LE(0x46464952, 0); // "RIFF"
  wavHeader.writeUInt32LE(36 + numSamples * 2, 4); // File size
  wavHeader.writeUInt32LE(0x45564157, 8); // "WAVE"
  wavHeader.writeUInt32LE(0x20746d66, 12); // "fmt "
  wavHeader.writeUInt32LE(16, 16); // Subchunk1 size
  wavHeader.writeUInt16LE(1, 20); // Audio format (1 = PCM)
  wavHeader.writeUInt16LE(1, 22); // Channels
  wavHeader.writeUInt32LE(sampleRate, 24); // Sample rate
  wavHeader.writeUInt32LE(sampleRate * 2, 28); // Byte rate
  wavHeader.writeUInt16LE(2, 32); // Block align
  wavHeader.writeUInt16LE(16, 34); // Bits per sample
  wavHeader.writeUInt32LE(0x61746164, 36); // "data"
  wavHeader.writeUInt32LE(numSamples * 2, 40); // Subchunk2 size

  return Buffer.concat([wavHeader, Buffer.from(audioData)]);
};

async function testAPI() {
  try {
    console.log('📤 Sending test request...\n');

    const audioBlob = createMinimalWav();
    const formData = new FormData();
    formData.append('file', new Blob([audioBlob], { type: 'audio/wav' }), 'test.wav');
    formData.append('model', ASR_MODEL);
    formData.append('language', 'en-US');
    formData.append('response_format', 'json');

    const response = await fetch(ASR_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': 'application/json'
      },
      body: formData,
    });

    console.log(`Status: ${response.status} ${response.statusText}\n`);

    const contentType = response.headers.get('content-type');
    console.log(`Content-Type: ${contentType}\n`);

    const body = await response.text();
    console.log('Response Body:');
    console.log(body);

    if (!response.ok) {
      console.error('\n❌ API returned an error');
      console.error('\nPossible issues:');
      console.error('  1. Invalid API key');
      console.error('  2. Wrong URL endpoint');
      console.error('  3. Invalid model name');
      console.error('  4. Request format mismatch');
    } else {
      console.log('\n✅ API request successful!');
      try {
        const json = JSON.parse(body);
        console.log('Parsed response:', json);
      } catch {
        console.log('Response is not JSON');
      }
    }
  } catch (error) {
    console.error('❌ Network error:', error.message);
    console.error('\nPossible issues:');
    console.error('  1. Network/firewall blocking the request');
    console.error('  2. Invalid URL');
    console.error('  3. CORS issue');
  }
}

testAPI();

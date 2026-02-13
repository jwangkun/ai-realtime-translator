import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Mistral } from '@mistralai/mistralai';
import { WebSocketServer } from 'ws';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY || '',
});

const sessions = new Map();

wss.on('connection', (ws) => {
  const sessionId = uuidv4();
  console.log(`New WebSocket connection: ${sessionId}`);
  
  const sessionData = {
    audioChunks: [] as Buffer[],
    lastTranscript: '',
    lastTranslation: '',
    isProcessing: false,
    sourceLanguage: 'zh',
    targetLanguage: 'en',
    processingTimer: null as NodeJS.Timeout | null,
  };
  sessions.set(sessionId, sessionData);
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'audio') {
        const audioBuffer = Buffer.from(message.audio, 'base64');
        sessionData.audioChunks.push(audioBuffer);
        sessionData.sourceLanguage = message.sourceLanguage || 'zh';
        sessionData.targetLanguage = message.targetLanguage || 'en';
        
        if (!sessionData.isProcessing) {
          scheduleProcessing(ws, sessionId, sessionData);
        }
      }
      
      if (message.type === 'config') {
        sessionData.sourceLanguage = message.sourceLanguage || 'zh';
        sessionData.targetLanguage = message.targetLanguage || 'en';
      }
      
      if (message.type === 'stop') {
        if (sessionData.processingTimer) {
          clearTimeout(sessionData.processingTimer);
          sessionData.processingTimer = null;
        }
        await processAudioStream(ws, sessionId, sessionData, true);
        sessionData.audioChunks = [];
        sessionData.lastTranscript = '';
        sessionData.lastTranslation = '';
      }
      
      if (message.type === 'clear') {
        sessionData.audioChunks = [];
        sessionData.lastTranscript = '';
        sessionData.lastTranslation = '';
        sessionData.isProcessing = false;
        if (sessionData.processingTimer) {
          clearTimeout(sessionData.processingTimer);
          sessionData.processingTimer = null;
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log(`WebSocket disconnected: ${sessionId}`);
    if (sessionData.processingTimer) {
      clearTimeout(sessionData.processingTimer);
    }
    sessions.delete(sessionId);
  });
  
  ws.send(JSON.stringify({
    type: 'connected',
    sessionId,
  }));
});

function scheduleProcessing(ws: any, sessionId: string, sessionData: any) {
  if (sessionData.processingTimer) return;
  
  sessionData.processingTimer = setTimeout(async () => {
    sessionData.processingTimer = null;
    if (sessionData.audioChunks.length > 0 && !sessionData.isProcessing) {
      await processAudioStream(ws, sessionId, sessionData, false);
      if (sessionData.audioChunks.length > 0) {
        scheduleProcessing(ws, sessionId, sessionData);
      }
    }
  }, 150);
}

async function processAudioStream(ws: any, sessionId: string, sessionData: any, isFinal: boolean) {
  if (sessionData.isProcessing || sessionData.audioChunks.length === 0) {
    return;
  }
  
  sessionData.isProcessing = true;
  
  try {
    const combinedAudio = Buffer.concat(sessionData.audioChunks);
    
    const minAudioSize = isFinal ? 0 : 4000;
    
    if (combinedAudio.length < minAudioSize && !isFinal) {
      sessionData.isProcessing = false;
      return;
    }
    
    const transcriptionResponse = await mistral.audio.transcriptions.complete({
      model: 'voxtral-mini-latest',
      file: {
        fileName: 'audio.webm',
        content: combinedAudio,
      },
      language: sessionData.sourceLanguage,
    });
    
    const newText = transcriptionResponse.text || '';
    
    if (newText && newText !== sessionData.lastTranscript) {
      sessionData.lastTranscript = newText;
      
      const translationResponse = await mistral.chat.complete({
        model: 'mistral-large-latest',
        messages: [
          {
            role: 'system',
            content: `You are a professional translator. Translate the following text from ${sessionData.sourceLanguage} to ${sessionData.targetLanguage}. Only return the translated text, no explanations.`,
          },
          {
            role: 'user',
            content: newText,
          },
        ],
      });
      
      const translatedText = translationResponse.choices?.[0]?.message?.content || '';
      sessionData.lastTranslation = translatedText;
      
      ws.send(JSON.stringify({
        type: 'transcription',
        sourceText: newText,
        targetText: translatedText,
        isFinal: isFinal,
      }));
    }
    
    if (isFinal) {
      sessionData.audioChunks = [];
      sessionData.lastTranscript = '';
      sessionData.lastTranslation = '';
    }
    
  } catch (error) {
    console.error('Transcription error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Transcription failed',
    }));
  } finally {
    sessionData.isProcessing = false;
  }
}

app.post('/api/translate', async (req, res) => {
  try {
    const { text, sourceLanguage, targetLanguage } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text required' });
    }

    const chatResponse = await mistral.chat.complete({
      model: 'mistral-large-latest',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}. Only return the translated text, no explanations.`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
    });

    const translatedText = chatResponse.choices?.[0]?.message?.content || text;
    
    res.json({
      translatedText,
      success: true,
    });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: 'Translation failed' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    mistralConfigured: !!process.env.MISTRAL_API_KEY,
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready for real-time transcription`);
});

import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, Square, ArrowRightLeft, Wifi, WifiOff, Loader2, Languages, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface TranscriptPair {
  id: string
  sourceText: string
  targetText: string
  timestamp: Date
  isStreaming?: boolean
}

const LANGUAGES = [
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
]

function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [sourceLanguage, setSourceLanguage] = useState('zh')
  const [targetLanguage, setTargetLanguage] = useState('en')
  const [transcripts, setTranscripts] = useState<TranscriptPair[]>([])
  const [currentPair, setCurrentPair] = useState<TranscriptPair | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
    }
  }, [transcripts, currentPair])

  useEffect(() => {
    const wsUrl = `ws://${window.location.hostname}:3002`
    const ws = new WebSocket(wsUrl)
    
    ws.onopen = () => setConnectionStatus('connected')
    ws.onclose = () => setConnectionStatus('disconnected')
    ws.onerror = () => setConnectionStatus('disconnected')
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      if (data.type === 'transcription') {
        const { sourceText, targetText, isFinal } = data
        
        if (isFinal) {
          if (sourceText || targetText) {
            setTranscripts(prev => [...prev, {
              id: `final-${Date.now()}`,
              sourceText,
              targetText,
              timestamp: new Date(),
            }])
          }
          setCurrentPair(null)
        } else {
          setCurrentPair({
            id: `streaming-${Date.now()}`,
            sourceText,
            targetText,
            timestamp: new Date(),
            isStreaming: true,
          })
        }
      }
    }
    
    wsRef.current = ws
    
    return () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'config',
        sourceLanguage,
        targetLanguage,
      }))
    }
  }, [sourceLanguage, targetLanguage])

  const sendAudioChunk = useCallback(() => {
    if (audioChunksRef.current.length === 0 || !wsRef.current) return
    
    const chunks = [...audioChunksRef.current]
    audioChunksRef.current = []
    
    const audioBlob = new Blob(chunks, { type: 'audio/webm' })
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64Audio = (reader.result as string).split(',')[1]
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'audio',
          audio: base64Audio,
          sourceLanguage,
          targetLanguage,
        }))
      }
    }
    reader.readAsDataURL(audioBlob)
  }, [sourceLanguage, targetLanguage])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          sampleRate: 16000,
          channelCount: 1
        }
      })
      
      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 16000
      })
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          const reader = new FileReader()
          reader.onloadend = () => {
            const base64Audio = (reader.result as string).split(',')[1]
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: 'stop',
                audio: base64Audio,
                sourceLanguage,
                targetLanguage,
              }))
            }
          }
          reader.readAsDataURL(audioBlob)
        }
        
        audioChunksRef.current = []
        stream.getTracks().forEach(track => track.stop())
      }
      
      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(100)
      setIsRecording(true)
      
      recordingIntervalRef.current = setInterval(() => {
        sendAudioChunk()
      }, 300)
      
    } catch (error) {
      console.error('Error starting recording:', error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
        recordingIntervalRef.current = null
      }
      
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const swapLanguages = () => {
    setSourceLanguage(targetLanguage)
    setTargetLanguage(sourceLanguage)
  }

  const sourceLang = LANGUAGES.find(l => l.code === sourceLanguage)
  const targetLang = LANGUAGES.find(l => l.code === targetLanguage)

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Languages className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">AI 实时同传</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge 
              variant={connectionStatus === 'connected' ? 'default' : 'destructive'}
              className="gap-1"
            >
              {connectionStatus === 'connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {connectionStatus === 'connected' ? '已连接' : '未连接'}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-center gap-4">
              <div className="flex-1 max-w-xs">
                <label className="text-xs text-muted-foreground mb-1.5 block">源语言</label>
                <Select value={sourceLanguage} onValueChange={setSourceLanguage} disabled={isRecording}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(lang => (
                      <SelectItem key={lang.code} value={lang.code}>
                        <span className="mr-2">{lang.flag}</span>
                        {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={swapLanguages}
                disabled={isRecording}
                className="mt-5"
              >
                <ArrowRightLeft className="w-4 h-4" />
              </Button>

              <div className="flex-1 max-w-xs">
                <label className="text-xs text-muted-foreground mb-1.5 block">目标语言</label>
                <Select value={targetLanguage} onValueChange={setTargetLanguage} disabled={isRecording}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(lang => (
                      <SelectItem key={lang.code} value={lang.code}>
                        <span className="mr-2">{lang.flag}</span>
                        {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 mb-6 min-h-[400px]">
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <span>{sourceLang?.flag}</span>
                  <span>{sourceLang?.name}</span>
                </CardTitle>
                {isRecording && (
                  <Badge variant="secondary" className="bg-red-500/10 text-red-500 border-red-500/20">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse mr-1" />
                    录音中
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea className="h-[350px]" ref={scrollAreaRef}>
                <div className="p-4 pt-0 space-y-4">
                  {transcripts.length === 0 && !currentPair && (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Volume2 className="w-10 h-10 mb-3 opacity-50" />
                      <p className="text-sm">原文将显示在这里</p>
                    </div>
                  )}
                  
                  {transcripts.map((t) => (
                    <div key={t.id} className="text-sm leading-relaxed">
                      {t.sourceText}
                    </div>
                  ))}
                  
                  {currentPair && (
                    <div className="text-sm leading-relaxed">
                      {currentPair.sourceText}
                      {currentPair.isStreaming && (
                        <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse" />
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <span>{targetLang?.flag}</span>
                  <span>{targetLang?.name}</span>
                </CardTitle>
                {currentPair?.isStreaming && (
                  <Badge variant="secondary" className="gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    翻译中
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea className="h-[350px]">
                <div className="p-4 pt-0 space-y-4">
                  {transcripts.length === 0 && !currentPair && (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Languages className="w-10 h-10 mb-3 opacity-50" />
                      <p className="text-sm">翻译将显示在这里</p>
                    </div>
                  )}
                  
                  {transcripts.map((t) => (
                    <div key={t.id} className="text-sm leading-relaxed">
                      {t.targetText}
                    </div>
                  ))}
                  
                  {currentPair && (
                    <div className="text-sm leading-relaxed">
                      {currentPair.targetText}
                      {currentPair.isStreaming && currentPair.targetText && (
                        <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse" />
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-center">
          <div className="flex flex-col items-center gap-3">
            <Button
              size="lg"
              onClick={isRecording ? stopRecording : startRecording}
              className={cn(
                "w-16 h-16 rounded-full",
                isRecording && "bg-destructive hover:bg-destructive/90"
              )}
            >
              {isRecording ? (
                <Square className="w-6 h-6 fill-current" />
              ) : (
                <Mic className="w-6 h-6" />
              )}
            </Button>
            
            <span className="text-sm text-muted-foreground">
              {isRecording ? '点击停止' : '点击开始录音'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App

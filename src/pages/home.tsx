import { Camera } from '@capacitor/camera';
import { useState, useRef, useEffect, useCallback } from "react";
import { encodeFull, decodeFull, maxPlaintextBytes, runSelfTest } from "@/lib/cryptoengine";
import { renderGlyphSVG, downloadSVG, downloadPNG } from "@/lib/gridrenderer";
import { scanImage } from "@/lib/scanengine";
import { loadImageFromFile, isAcceptedFormat, videoFrameToImageData } from "@/lib/imageloader";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle, Camera, Check, Download, ExternalLink, RefreshCw,
  Upload, Lock, Unlock, FileImage, Smartphone, ShieldAlert, Zap,
  Globe, ShieldCheck, Phone, Mail, MessageSquare, MapPin, Wifi,
  User, CalendarDays, CreditCard, Copy, FileText,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const WORDS = ["COBRA","RAVEN","DELTA","STORM","ECHO","FALCON","GHOST","HYDRA","IRON",
  "JADE","KILO","LIMA","NOVA","ORBIT","PRIME","QUARTZ","SIGMA","TITAN","ULTRA",
  "VIPER","WHISKEY","XRAY","YANKEE","ZERO"];

function generateCode() {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${word}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

type PayloadType = "url" | "email" | "phone" | "sms" | "geo" | "wifi" | "vcard" | "calendar" | "upi" | "text";

function detectPayloadType(str: string): PayloadType {
  const s = str.trim().toLowerCase();
  if (s.startsWith("https://") || s.startsWith("http://")) return "url";
  if (s.startsWith("mailto:"))         return "email";
  if (s.startsWith("tel:"))            return "phone";
  if (s.startsWith("sms:"))            return "sms";
  if (s.startsWith("geo:"))            return "geo";
  if (s.startsWith("wifi:"))           return "wifi";
  if (s.startsWith("begin:vcard"))     return "vcard";
  if (s.startsWith("begin:vcalendar")) return "calendar";
  if (s.startsWith("upi://"))          return "upi";
  return "text";
}

const PAYLOAD_META: Record<PayloadType, { label: string; action: string; color: string }> = {
  url:      { label: "Website URL",     action: "Open URL",        color: "#00c8ff" },
  email:    { label: "Email Address",   action: "Send Email",      color: "#f59e0b" },
  phone:    { label: "Phone Number",    action: "Call Number",     color: "#00e5a0" },
  sms:      { label: "SMS Message",     action: "Send SMS",        color: "#a78bfa" },
  geo:      { label: "Location",        action: "Open in Maps",    color: "#f87171" },
  wifi:     { label: "Wi-Fi Network",   action: "Connect",         color: "#38bdf8" },
  vcard:    { label: "Contact Card",    action: "Save Contact",    color: "#fb923c" },
  calendar: { label: "Calendar Event",  action: "Save Event",      color: "#4ade80" },
  upi:      { label: "UPI Payment",     action: "Pay Now",         color: "#e879f9" },
  text:     { label: "Plain Text",      action: "Copy Text",       color: "#94a3b8" },
};

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function triggerPayload(decoded: string) {
  const s     = decoded.trim();
  const lower = s.toLowerCase();
  if (lower.startsWith("https://") || lower.startsWith("http://")) {
    window.open(s, "_blank", "noopener,noreferrer");
  } else if (
    lower.startsWith("tel:")    ||
    lower.startsWith("mailto:") ||
    lower.startsWith("sms:")    ||
    lower.startsWith("geo:")    ||
    lower.startsWith("upi://")  ||
    lower.startsWith("wifi:")
  ) {
    window.location.href = s;
  } else if (lower.startsWith("begin:vcard")) {
    downloadBlob(s, "text/vcard", "contact.vcf");
  } else if (lower.startsWith("begin:vcalendar")) {
    downloadBlob(s, "text/calendar", "event.ics");
  } else {
    navigator.clipboard?.writeText(s).catch(() => {});
  }
}

function LoadingDots() {
  return (
    <span className="flex items-center gap-1">
      <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
    </span>
  );
}

/* ── Rotating camera-lens spinner ── */
function CameraLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-6">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-[#a78bfa]/15" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#a78bfa] animate-spin" />
        <Camera className="absolute inset-0 m-auto w-5 h-5 text-[#a78bfa]/70" />
      </div>
      <p className="text-xs text-[#a78bfa]/80 font-mono tracking-widest uppercase">{label}</p>
    </div>
  );
}

export default function Home() {
  const MAX_CHARS = maxPlaintextBytes();

  const [plaintext, setPlaintext]     = useState("");
  const [encodeCode, setEncodeCode]   = useState("");
  const [useEncodeCode, setUseEncodeCode] = useState(false);
  const [isEncoding, setIsEncoding]   = useState(false);
  const [encodeError, setEncodeError] = useState("");
  const [glyphSvg, setGlyphSvg]       = useState<string | null>(null);

  const [decodeCode, setDecodeCode]       = useState("");
  const [useDecodeCode, setUseDecodeCode] = useState(false);
  const [isDecoding, setIsDecoding]       = useState(false);
  const [decodeError, setDecodeError]     = useState("");
  const [decodedMessage, setDecodedMessage] = useState("");
  const [copied, setCopied] = useState(false);

  // camera states
  const [isCameraActive,  setIsCameraActive]  = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);  // warmup
  const [isCameraReady,   setIsCameraReady]   = useState(false);  // first frame received

  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSecure = typeof window !== "undefined" && window.isSecureContext;
  const [selfTest, setSelfTest] = useState<{ ok: boolean; detail: string } | null>(null);
const handleCameraScan = async () => {
  try {
    await Camera.requestPermissions();

    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: 'base64',
      source: 'camera'
    });

    if (!photo.base64String) {
      throw new Error("No image captured");
    }

    const img = new Image();
    img.src = `data:image/jpeg;base64,${photo.base64String}`;

    img.onload = async () => {
      try {
        setIsDecoding(true);
        setDecodeError("");

        const result = await scanImage(img);

        setDecodedMessage(result);
      } catch (err: any) {
        setDecodeError(err?.message || "Decoding failed");
      } finally {
        setIsDecoding(false);
      }
    };

  } catch (err: any) {
    setDecodeError(err?.message || "Camera failed");
  }
};
  useEffect(() => {
    setEncodeCode(generateCode());
    setDecodeCode(generateCode());
    runSelfTest().then(setSelfTest);
  }, []);

  useEffect(() => () => stopCamera(), []);

  /* ─── Encode ─── */
  const handleEncode = async () => {
    setEncodeError(""); setGlyphSvg(null);
    if (!plaintext)  { setEncodeError("Message cannot be empty."); return; }
    if (useEncodeCode && !encodeCode) { setEncodeError("Group Code is required when enabled."); return; }
    setIsEncoding(true);
    try {
      await new Promise(r => setTimeout(r, 350));
      const payload = await encodeFull(plaintext, useEncodeCode ? encodeCode : "");
      setGlyphSvg(renderGlyphSVG(payload));
    } catch (err: unknown) {
      setEncodeError((err as Error).message || "Failed to encode message.");
    } finally { setIsEncoding(false); }
  };

  const handleDownloadSVG = async () => {
  if (!glyphSvg) return;
  try { await downloadSVG(glyphSvg); }
  catch (err: unknown) { setEncodeError("SVG save failed: " + (err as Error).message); }
  };
  const handleDownloadPNG = async () => {
    if (!glyphSvg) return;
    try { await downloadPNG(glyphSvg); }
    catch (err: unknown) { setEncodeError("PNG render failed: " + (err as Error).message); }
  };

  /* ─── Camera ─── */
  const stopCamera = () => {
    if (cameraTimeoutRef.current) clearTimeout(cameraTimeoutRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraActive(false);
    setIsCameraLoading(false);
    setIsCameraReady(false);
  };

  const handleVideoReady = () => {
    // called when first frame arrives
    if (cameraTimeoutRef.current) clearTimeout(cameraTimeoutRef.current);
    setIsCameraLoading(false);
    setIsCameraReady(true);
  };

  const startCamera = async () => {
    setDecodeError(""); setDecodedMessage("");
    if (!isSecure || !navigator.mediaDevices?.getUserMedia) {
      setDecodeError(
        "Live camera needs HTTPS. Use \"Take Photo\" or \"Load Image\" instead."
      );
      return;
    }
    setIsCameraLoading(true);
    setIsCameraActive(true);
    setIsCameraReady(false);

    // Timeout: if camera doesn't produce a frame in 10s, show error
    cameraTimeoutRef.current = setTimeout(() => {
      stopCamera();
      setDecodeError("Camera took too long to start. Try 'Take Photo' or 'Load Image' instead.");
    }, 10_000);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // play() to start the stream immediately
        videoRef.current.play().catch(() => {});
      }
    } catch (err: unknown) {
      stopCamera();
      const name = (err as Error & { name?: string }).name;
      if      (name === "NotAllowedError")  setDecodeError("Camera permission denied. Use 'Take Photo' or 'Load Image'.");
      else if (name === "NotFoundError")    setDecodeError("No camera found. Use file upload instead.");
      else if (name === "NotReadableError") setDecodeError("Camera in use by another app. Close it and retry.");
      else setDecodeError("Camera error: " + (err as Error).message);
    }
  };

  const handleCaptureAndDecode = async () => {
    if (!videoRef.current || !isCameraReady) return;
    if (useDecodeCode && !decodeCode) { setDecodeError("Group Code is required when enabled."); return; }
    setIsDecoding(true); setDecodeError(""); setDecodedMessage("");
    try {
      const imageData = videoFrameToImageData(videoRef.current);
      const { payload } = await scanImage(imageData);
      const decoded = await decodeFull(payload, useDecodeCode ? decodeCode : "");
      setDecodedMessage(decoded);
      stopCamera();
    } catch (err: unknown) {
      setDecodeError((err as Error).message || "Failed to decode glyph.");
    } finally { setIsDecoding(false); }
  };

  /* ─── File handling ─── */
  const processFile = async (file: File) => {
    if (useDecodeCode && !decodeCode) { setDecodeError("Group Code is required when enabled."); return; }
    setIsDecoding(true); setDecodeError(""); setDecodedMessage("");
    stopCamera();
    try {
      if (!isAcceptedFormat(file)) throw new Error("Unsupported format. Use PNG, JPG, or SVG.");
      const imageData = await loadImageFromFile(file);
      const { payload } = await scanImage(imageData);
      const decoded = await decodeFull(payload, useDecodeCode ? decodeCode : "");
      setDecodedMessage(decoded);
    } catch (err: unknown) {
      setDecodeError((err as Error).message || "Failed to decode from file.");
    } finally { setIsDecoding(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
    if (e.target) e.target.value = "";
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) await processFile(file);
  }, [decodeCode, useDecodeCode]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);

  /* ─── Render ─── */
  return (
    <div className="min-h-screen w-full flex flex-col items-center py-10 px-4 sm:px-6 bg-background">

      {/* ── Logo header ── */}
      <div className="w-full max-w-2xl mb-8 flex flex-col items-center">

        {/* Dashboard logo */}
        <div className="mb-4 flex items-center justify-center w-full">
          <img
            src="/logo-horizontal-transparent.png"
            alt="HexGlyph Code"
            className="w-auto select-none"
            style={{
              height: "clamp(52px, 10vw, 80px)",
              filter: "drop-shadow(0 0 20px rgba(74,122,255,0.5)) drop-shadow(0 0 8px rgba(0,200,255,0.3))",
            }}
            draggable={false}
          />
        </div>

        <p className="text-muted-foreground text-sm text-center tracking-wide">
          Proprietary Visual Cipher Tool
        </p>
        <p className="text-xs text-muted-foreground mt-4 border border-border px-3 py-1 rounded bg-muted/40">
          Keys rotate at UTC midnight · Max message: {MAX_CHARS} bytes
        </p>

        {/* Crypto self-test badge */}
        <div className="mt-3 flex items-center gap-2 text-xs px-3 py-1 rounded border border-border bg-muted/20">
          {selfTest === null ? (
            <span className="text-muted-foreground flex items-center gap-2">
              <LoadingDots /><span>Running crypto self-test…</span>
            </span>
          ) : selfTest.ok ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-[#00e5a0] shadow-[0_0_6px_#00e5a0]" />
              <span className="text-[#00e5a0] font-semibold">Crypto OK</span>
              <span className="text-muted-foreground">— {selfTest.detail}</span>
            </>
          ) : (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
              <span className="text-red-400 font-semibold">Crypto FAIL</span>
              <span className="text-muted-foreground">— {selfTest.detail}</span>
            </>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="encode" className="w-full max-w-2xl">
        <TabsList className="grid w-full grid-cols-2 mb-8 bg-[#08090f] rounded-none border border-white/[0.08]">
          <TabsTrigger value="encode" className="
            rounded-none uppercase font-bold tracking-widest py-3 text-base transition-all duration-200
            data-[state=active]:bg-[#00c8ff] data-[state=active]:text-black data-[state=active]:shadow-[0_2px_20px_rgba(0,200,255,0.35)]
            data-[state=inactive]:text-[#00c8ff]/60 data-[state=inactive]:bg-transparent
            hover:text-[#00c8ff] hover:bg-[#00c8ff]/10">
            <Lock className="w-4 h-4 mr-2 inline-block" /> Encode
          </TabsTrigger>
          <TabsTrigger value="decode" className="
            rounded-none uppercase font-bold tracking-widest py-3 text-base transition-all duration-200
            data-[state=active]:bg-[#a78bfa] data-[state=active]:text-black data-[state=active]:shadow-[0_2px_20px_rgba(167,139,250,0.35)]
            data-[state=inactive]:text-[#a78bfa]/60 data-[state=inactive]:bg-transparent
            hover:text-[#a78bfa] hover:bg-[#a78bfa]/10">
            <Unlock className="w-4 h-4 mr-2 inline-block" /> Decode
          </TabsTrigger>
        </TabsList>

        {/* ── ENCODE ── */}
        <TabsContent value="encode" className="space-y-6">
          <Card className="rounded-none border-border shadow-2xl bg-card">
            <CardHeader className="border-b border-border bg-[#00c8ff]/5">
              <CardTitle className="flex items-center gap-2 text-xl font-bold uppercase tracking-wider">
                <Lock className="w-5 h-5 text-[#00c8ff]" />
                <span className="text-[#00c8ff]">Encrypt</span>
                <span className="text-foreground">Message</span>
              </CardTitle>
              <CardDescription>Convert plaintext into a secure hexagonal glyph.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="plaintext" className="text-muted-foreground font-semibold tracking-wide uppercase text-xs">
                    Plaintext Message
                  </Label>
                  <span className={`text-xs font-mono ${new Blob([plaintext]).size > MAX_CHARS ? "text-destructive" : "text-muted-foreground"}`}>
                    {new Blob([plaintext]).size} / {MAX_CHARS} bytes
                  </span>
                </div>
                <Textarea
                  id="plaintext"
                  placeholder={`Enter message or URL to encrypt (max ${MAX_CHARS} bytes)…`}
                  className="min-h-[120px] font-mono resize-y rounded-none border-border focus-visible:ring-[#00c8ff] focus-visible:border-[#00c8ff] bg-background"
                  value={plaintext}
                  onChange={e => setPlaintext(e.target.value)}
                  data-testid="input-plaintext"
                />
              </div>

              {/* ── Encode Mode Selector ── */}
              <div className="space-y-3">
                <Label className="text-muted-foreground font-semibold tracking-wide uppercase text-xs">
                  Glyph Mode
                </Label>

                {/* Mode toggle row */}
                <div className="grid grid-cols-2 gap-0 border border-border">
                  <button
                    type="button"
                    onClick={() => setUseEncodeCode(false)}
                    className={`flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-widest transition-all duration-200
                      ${!useEncodeCode
                        ? "bg-[#00e5a0]/15 text-[#00e5a0] border-r border-[#00e5a0]/30 shadow-[inset_0_0_12px_rgba(0,229,160,0.08)]"
                        : "bg-muted/20 text-muted-foreground border-r border-border hover:bg-muted/40 hover:text-foreground"
                      }`}
                    data-testid="button-encode-mode-normal"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Normal
                    {!useEncodeCode && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-[#00e5a0] shadow-[0_0_4px_#00e5a0]" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setUseEncodeCode(true); if (!encodeCode) setEncodeCode(generateCode()); }}
                    className={`flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-widest transition-all duration-200
                      ${useEncodeCode
                        ? "bg-[#00c8ff]/10 text-[#00c8ff] shadow-[inset_0_0_12px_rgba(0,200,255,0.08)]"
                        : "bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                    data-testid="button-encode-mode-confidential"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Confidential
                    {useEncodeCode && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-[#00c8ff] shadow-[0_0_4px_#00c8ff]" />}
                  </button>
                </div>

                {/* Mode body */}
                {!useEncodeCode ? (
                  <div className="flex items-start gap-3 border border-[#00e5a0]/20 bg-[#00e5a0]/5 px-4 py-3 animate-in fade-in duration-200">
                    <Globe className="w-4 h-4 text-[#00e5a0]/70 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <span className="text-[#00e5a0] font-semibold">Normal mode</span> — No Group Code required.
                      Anyone can decode this glyph without a shared secret.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 animate-in slide-in-from-top-2 fade-in duration-200">
                    <div className="flex items-start gap-3 border border-[#00c8ff]/20 bg-[#00c8ff]/5 px-4 py-3 mb-3">
                      <ShieldCheck className="w-4 h-4 text-[#00c8ff]/70 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        <span className="text-[#00c8ff] font-semibold">Confidential mode</span> — Glyph is locked to this Group Code.
                        Decoder must use the exact same code to read it.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        id="encodeCode" value={encodeCode}
                        onChange={e => setEncodeCode(e.target.value.toUpperCase())}
                        autoComplete="off" placeholder="WORD-NNNN"
                        className="font-mono uppercase rounded-none border-border focus-visible:ring-[#00c8ff] bg-background text-[#00c8ff] tracking-widest text-lg h-12"
                        data-testid="input-encode-code"
                      />
                      <Button variant="outline" type="button"
                        onClick={() => setEncodeCode(generateCode())}
                        className="rounded-none border-border hover:border-[#00c8ff]/50 hover:bg-[#00c8ff]/10 hover:text-[#00c8ff] h-12 w-12 flex-shrink-0"
                        title="Generate new code" data-testid="button-regenerate-code">
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {encodeError && (
                <Alert variant="destructive" className="rounded-none border-destructive/50 bg-destructive/10">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Encoding Failed</AlertTitle>
                  <AlertDescription className="font-mono text-sm">{encodeError}</AlertDescription>
                </Alert>
              )}

              <Button onClick={handleEncode}
                disabled={isEncoding || !plaintext || (useEncodeCode && !encodeCode)}
                className="btn-glyph w-full rounded-none h-14 text-lg uppercase font-bold tracking-widest bg-[#00e5a0] hover:bg-[#00e5a0]/90 text-black disabled:opacity-40"
                data-testid="button-generate-glyph">
                {isEncoding
                  ? <span className="flex items-center gap-3"><RefreshCw className="w-5 h-5 animate-spin" />Processing…</span>
                  : <span className="flex items-center gap-3"><Zap className="w-5 h-5" />Generate Glyph</span>}
              </Button>
            </CardContent>

            {glyphSvg && (
              <CardFooter className="border-t border-border pt-6 flex flex-col items-center space-y-6 bg-background/60">
                <div className="text-sm font-semibold tracking-wide uppercase text-[#00e5a0] mb-2">Generated Glyph</div>
                <div className="w-full bg-[#05070d] border border-border shadow-lg animate-in fade-in zoom-in duration-500 [&>svg]:block [&>svg]:w-full [&>svg]:h-auto"
                  dangerouslySetInnerHTML={{ __html: glyphSvg }} data-testid="glyph-preview" />
                <div className="flex gap-4 w-full">
                  <Button onClick={handleDownloadSVG} variant="outline"
                    className="flex-1 rounded-none border-border hover:border-[#00c8ff]/50 hover:bg-[#00c8ff]/10 hover:text-[#00c8ff] h-12"
                    data-testid="button-download-svg">
                    <Download className="w-4 h-4 mr-2" /> SVG
                  </Button>
                  <Button onClick={handleDownloadPNG} variant="outline"
                    className="flex-1 rounded-none border-border hover:border-[#00e5a0]/50 hover:bg-[#00e5a0]/10 hover:text-[#00e5a0] h-12"
                    data-testid="button-download-png">
                    <Download className="w-4 h-4 mr-2" /> PNG
                  </Button>
                </div>
              </CardFooter>
            )}
          </Card>
        </TabsContent>

        {/* ── DECODE ── */}
        <TabsContent value="decode" className="space-y-6">
          <Card className="rounded-none border-border shadow-2xl bg-card" onDrop={handleDrop} onDragOver={handleDragOver}>
            <CardHeader className="border-b border-border bg-[#a78bfa]/5">
              <CardTitle className="flex items-center gap-2 text-xl font-bold uppercase tracking-wider">
                <Unlock className="w-5 h-5 text-[#a78bfa]" />
                <span className="text-[#a78bfa]">Decrypt</span>
                <span className="text-foreground">Glyph</span>
              </CardTitle>
              <CardDescription>Scan or upload a HexGlyph image to reveal the message.</CardDescription>
            </CardHeader>

            <CardContent className="pt-6 space-y-6">
              {/* ── Decode Mode Selector ── */}
              <div className="space-y-3">
                <Label className="text-muted-foreground font-semibold tracking-wide uppercase text-xs">
                  Glyph Mode
                </Label>

                {/* Mode toggle row */}
                <div className="grid grid-cols-2 gap-0 border border-border">
                  <button
                    type="button"
                    onClick={() => setUseDecodeCode(false)}
                    className={`flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-widest transition-all duration-200
                      ${!useDecodeCode
                        ? "bg-[#00e5a0]/15 text-[#00e5a0] border-r border-[#00e5a0]/30 shadow-[inset_0_0_12px_rgba(0,229,160,0.08)]"
                        : "bg-muted/20 text-muted-foreground border-r border-border hover:bg-muted/40 hover:text-foreground"
                      }`}
                    data-testid="button-decode-mode-normal"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Normal
                    {!useDecodeCode && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-[#00e5a0] shadow-[0_0_4px_#00e5a0]" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseDecodeCode(true)}
                    className={`flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-widest transition-all duration-200
                      ${useDecodeCode
                        ? "bg-[#a78bfa]/10 text-[#a78bfa] shadow-[inset_0_0_12px_rgba(167,139,250,0.08)]"
                        : "bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                    data-testid="button-decode-mode-confidential"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Confidential
                    {useDecodeCode && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-[#a78bfa] shadow-[0_0_4px_#a78bfa]" />}
                  </button>
                </div>

                {/* Mode body */}
                {!useDecodeCode ? (
                  <div className="flex items-start gap-3 border border-[#00e5a0]/20 bg-[#00e5a0]/5 px-4 py-3 animate-in fade-in duration-200">
                    <Globe className="w-4 h-4 text-[#00e5a0]/70 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <span className="text-[#00e5a0] font-semibold">Normal mode</span> — No Group Code needed.
                      Decodes any glyph that was encoded without a Group Code.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 animate-in slide-in-from-top-2 fade-in duration-200">
                    <div className="flex items-start gap-3 border border-[#a78bfa]/20 bg-[#a78bfa]/5 px-4 py-3 mb-3">
                      <ShieldCheck className="w-4 h-4 text-[#a78bfa]/70 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        <span className="text-[#a78bfa] font-semibold">Confidential mode</span> — Enter the Group Code
                        that was used to encode this glyph. Wrong code will fail authentication.
                      </p>
                    </div>
                    <Input id="decodeCode" value={decodeCode}
                      onChange={e => setDecodeCode(e.target.value.toUpperCase())}
                      autoComplete="off" placeholder="WORD-NNNN"
                      className="font-mono uppercase rounded-none border-border focus-visible:ring-[#a78bfa] bg-background text-[#a78bfa] tracking-widest text-lg h-12"
                      data-testid="input-decode-code" />
                  </div>
                )}
              </div>

              {/* ── Camera active: full-width view ── */}
              {isCameraActive ? (
                <div className="relative w-full border border-[#a78bfa]/40 bg-black overflow-hidden">
                  {/* Loading overlay — shown until first frame */}
                  {isCameraLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
                      <CameraLoader label="Preparing camera…" />
                    </div>
                  )}

                  {/* Video feed */}
                  <video
                    ref={videoRef}
                    autoPlay playsInline muted
                    onLoadedMetadata={handleVideoReady}
                    className="w-full object-cover"
                    style={{ maxHeight: "340px", minHeight: "220px" }}
                  />

                  {/* Scan-guide crosshair overlay */}
                  {isCameraReady && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-40 h-40 border-2 border-[#a78bfa]/60 rounded-sm relative">
                        {["-top-px -left-px","  -top-px -right-px","-bottom-px -left-px","-bottom-px -right-px"].map((_, i) => (
                          <span key={i} className="absolute w-3 h-3 border-[#a78bfa]"
                            style={{
                              top:    i < 2 ? -2 : "auto", bottom: i >= 2 ? -2 : "auto",
                              left:   i%2===0 ? -2 : "auto", right: i%2===1 ? -2 : "auto",
                              borderTopWidth:    i < 2  ? 2 : 0,
                              borderBottomWidth: i >= 2 ? 2 : 0,
                              borderLeftWidth:   i%2===0 ? 2 : 0,
                              borderRightWidth:  i%2===1 ? 2 : 0,
                            }} />
                        ))}
                        <span className="absolute -top-6 left-0 right-0 text-center text-[10px] text-[#a78bfa]/80 tracking-widest uppercase font-mono">
                          Aim at glyph
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Action bar */}
                  <div className="flex gap-0 border-t border-[#a78bfa]/30">
                    <Button onClick={handleCaptureAndDecode}
                      disabled={isDecoding || !isCameraReady || (useDecodeCode && !decodeCode)}
                      className="flex-1 rounded-none h-12 bg-[#a78bfa] hover:bg-[#a78bfa]/90 text-black font-bold uppercase tracking-widest text-sm"
                      data-testid="button-scan">
                      {isDecoding
                        ? <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Scanning…</span>
                        : <span className="flex items-center gap-2"><Camera className="w-4 h-4" />Scan Glyph</span>}
                    </Button>
                    <Button onClick={stopCamera} variant="destructive"
                      className="rounded-none px-5 h-12 text-sm font-semibold"
                      data-testid="button-stop-camera">
                      Stop
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── Camera idle: 2-col tile layout ── */
                <div className="grid grid-cols-2 gap-4">
                  {/* Camera tile */}
                  <div className="border border-border bg-background p-4 flex flex-col items-center justify-center gap-3 min-h-[180px] text-center">
                    <div className="p-3 bg-muted rounded-full text-[#a78bfa]">
                      <Camera className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-semibold uppercase tracking-wide">Camera Scan</div>
                    {!isSecure && (
                      <p className="text-xs text-amber-400 flex items-center gap-1 px-1">
                        <ShieldAlert className="w-3 h-3 flex-shrink-0" />
                        HTTPS required for live camera
                      </p>
                    )}
                    <Button onClick={startCamera}
                      className="rounded-none w-full text-xs bg-[#a78bfa] hover:bg-[#a78bfa]/90 text-black font-semibold h-9"
                      data-testid="button-start-camera">
                      Start Camera
                    </Button>
                    <input ref={photoInputRef} type="file" accept="image/*"
                      capture="environment" className="hidden"
                      onChange={handleFileUpload} disabled={isDecoding}
                      data-testid="input-photo-capture" />
                    <Button variant="outline"
                      className="rounded-none w-full text-xs border-[#a78bfa]/30 hover:border-[#a78bfa] hover:bg-[#a78bfa]/10 hover:text-[#a78bfa] h-9"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={isDecoding} data-testid="button-take-photo">
                      <Smartphone className="w-3 h-3 mr-1" /> Take Photo
                    </Button>
                  </div>

                  {/* File drop tile */}
                  <div className="border border-dashed border-border bg-background p-4 flex flex-col items-center justify-center gap-3 min-h-[180px] text-center group hover:border-[#a78bfa]/50 transition-colors"
                    data-testid="drop-zone">
                    <div className="p-3 bg-muted rounded-full text-foreground group-hover:text-[#a78bfa] transition-colors">
                      <FileImage className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-semibold uppercase tracking-wide">Image File</div>
                    <p className="text-xs text-muted-foreground px-2">Drag & Drop or Click<br/>(PNG, JPG, SVG)</p>
                    <div className="w-full">
                      <input type="file" id="file-upload" className="hidden"
                        accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                        onChange={handleFileUpload} disabled={isDecoding}
                        data-testid="input-file-upload" />
                      <Button asChild
                        className="rounded-none w-full text-xs cursor-pointer bg-[#a78bfa]/15 hover:bg-[#a78bfa]/25 text-[#a78bfa] border border-[#a78bfa]/30 hover:border-[#a78bfa]/60 h-9">
                        <label htmlFor="file-upload">
                          {isDecoding
                            ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Scanning…</>
                            : <><Upload className="w-4 h-4 mr-2" />Load Image</>}
                        </label>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {decodeError && (
                <Alert variant="destructive" className="rounded-none border-destructive/50 bg-destructive/10">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Decoding Failed</AlertTitle>
                  <AlertDescription className="font-mono text-sm">{decodeError}</AlertDescription>
                </Alert>
              )}

              {decodedMessage && (() => {
                const ptype  = detectPayloadType(decodedMessage);
                const pmeta  = PAYLOAD_META[ptype];
                const typeIcon: Record<PayloadType, React.ReactNode> = {
                  url:      <ExternalLink className="w-4 h-4" />,
                  email:    <Mail        className="w-4 h-4" />,
                  phone:    <Phone       className="w-4 h-4" />,
                  sms:      <MessageSquare className="w-4 h-4" />,
                  geo:      <MapPin      className="w-4 h-4" />,
                  wifi:     <Wifi        className="w-4 h-4" />,
                  vcard:    <User        className="w-4 h-4" />,
                  calendar: <CalendarDays className="w-4 h-4" />,
                  upi:      <CreditCard  className="w-4 h-4" />,
                  text:     <FileText    className="w-4 h-4" />,
                };
                const handleCopy = () => {
                  navigator.clipboard?.writeText(decodedMessage.trim()).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                };
                return (
                <div key={decodedMessage} className="border bg-[#a78bfa]/5 animate-in slide-in-from-top-4 fade-in duration-300"
                  style={{ borderColor: pmeta.color + "55" }}
                  data-testid="decoded-result">

                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b"
                    style={{ borderColor: pmeta.color + "33", backgroundColor: pmeta.color + "0d" }}>
                    <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-sm"
                      style={{ color: pmeta.color }}>
                      {typeIcon[ptype]}
                      {pmeta.label}
                    </div>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-widest border"
                      style={{ color: pmeta.color, borderColor: pmeta.color + "44", backgroundColor: pmeta.color + "15" }}>
                      <Check className="w-3 h-3" /> Decrypted
                    </div>
                  </div>

                  {/* Payload preview */}
                  <div className="px-4 pt-4 pb-3">
                    <div className="font-mono text-xs break-all bg-muted/30 border border-border px-3 py-2 text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {decodedMessage.trim()}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="px-4 pb-4 flex gap-2">
                    <Button
                      onClick={() => triggerPayload(decodedMessage)}
                      className="flex-1 rounded-none h-11 uppercase font-bold tracking-widest text-sm text-black"
                      style={{ backgroundColor: pmeta.color }}
                      data-testid="button-payload-action">
                      {typeIcon[ptype]}
                      <span className="ml-2">{pmeta.action}</span>
                    </Button>
                    <Button
                      onClick={handleCopy}
                      variant="outline"
                      className="rounded-none h-11 w-11 flex-shrink-0 border-border hover:border-[#a78bfa]/50 hover:bg-[#a78bfa]/10 hover:text-[#a78bfa]"
                      title="Copy to clipboard"
                      data-testid="button-copy-payload">
                      {copied ? <Check className="w-4 h-4 text-[#00e5a0]" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

              {/* ── Camera active: full-width view ── */}
              {isCameraActive ? (
                <div className="relative w-full border border-[#a78bfa]/40 bg-black overflow-hidden">
                  {/* Loading overlay — shown until first frame */}
                  {isCameraLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
                      <CameraLoader label="Preparing camera…" />
                    </div>
                  )}

                  {/* Video feed */}
                  <video
                    ref={videoRef}
                    autoPlay playsInline muted
                    onLoadedMetadata={handleVideoReady}
                    className="w-full object-cover"
                    style={{ maxHeight: "340px", minHeight: "220px" }}
                  />

                  {/* Scan-guide crosshair overlay */}
                  {isCameraReady && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-40 h-40 border-2 border-[#a78bfa]/60 rounded-sm relative">
                        {/* corner marks */}
                        {["-top-px -left-px","  -top-px -right-px","-bottom-px -left-px","-bottom-px -right-px"].map((_, i) => (
                          <span key={i} className="absolute w-3 h-3 border-[#a78bfa]"
                            style={{
                              top:    i < 2 ? -2 : "auto", bottom: i >= 2 ? -2 : "auto",
                              left:   i%2===0 ? -2 : "auto", right: i%2===1 ? -2 : "auto",
                              borderTopWidth:    i < 2  ? 2 : 0,
                              borderBottomWidth: i >= 2 ? 2 : 0,
                              borderLeftWidth:   i%2===0 ? 2 : 0,
                              borderRightWidth:  i%2===1 ? 2 : 0,
                            }} />
                        ))}
                        <span className="absolute -top-6 left-0 right-0 text-center text-[10px] text-[#a78bfa]/80 tracking-widest uppercase font-mono">
                          Aim at glyph
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Action bar */}
                  <div className="flex gap-0 border-t border-[#a78bfa]/30">
                    <Button onClick={handleCaptureAndDecode}
                      disabled={isDecoding || !isCameraReady || (useDecodeCode && !decodeCode)}
                      className="flex-1 rounded-none h-12 bg-[#a78bfa] hover:bg-[#a78bfa]/90 text-black font-bold uppercase tracking-widest text-sm"
                      data-testid="button-scan">
                      {isDecoding
                        ? <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Scanning…</span>
                        : <span className="flex items-center gap-2"><Camera className="w-4 h-4" />Scan Glyph</span>}
                    </Button>
                    <Button onClick={stopCamera} variant="destructive"
                      className="rounded-none px-5 h-12 text-sm font-semibold"
                      data-testid="button-stop-camera">
                      Stop
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── Camera idle: 2-col tile layout ── */
                <div className="grid grid-cols-2 gap-4">
                  {/* Camera tile */}
                  <div className="border border-border bg-background p-4 flex flex-col items-center justify-center gap-3 min-h-[180px] text-center">
                    <div className="p-3 bg-muted rounded-full text-[#a78bfa]">
                      <Camera className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-semibold uppercase tracking-wide">Camera Scan</div>
                    {!isSecure && (
                      <p className="text-xs text-amber-400 flex items-center gap-1 px-1">
                        <ShieldAlert className="w-3 h-3 flex-shrink-0" />
                        HTTPS required for live camera
                      </p>
                    )}
                    <Button onClick={startCamera}
                      className="rounded-none w-full text-xs bg-[#a78bfa] hover:bg-[#a78bfa]/90 text-black font-semibold h-9"
                      data-testid="button-start-camera">
                      Start Camera
                    </Button>
                    <input ref={photoInputRef} type="file" accept="image/*"
                      capture="environment" className="hidden"
                      onChange={handleFileUpload} disabled={isDecoding}
                      data-testid="input-photo-capture" />
                    <Button variant="outline"
                      className="rounded-none w-full text-xs border-[#a78bfa]/30 hover:border-[#a78bfa] hover:bg-[#a78bfa]/10 hover:text-[#a78bfa] h-9"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={isDecoding} data-testid="button-take-photo">
                      <Smartphone className="w-3 h-3 mr-1" /> Take Photo
                    </Button>
                  </div>

                  {/* File drop tile */}
                  <div className="border border-dashed border-border bg-background p-4 flex flex-col items-center justify-center gap-3 min-h-[180px] text-center group hover:border-[#a78bfa]/50 transition-colors"
                    data-testid="drop-zone">
                    <div className="p-3 bg-muted rounded-full text-foreground group-hover:text-[#a78bfa] transition-colors">
                      <FileImage className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-semibold uppercase tracking-wide">Image File</div>
                    <p className="text-xs text-muted-foreground px-2">Drag & Drop or Click<br/>(PNG, JPG, SVG)</p>
                    <div className="w-full">
                      <input type="file" id="file-upload" className="hidden"
                        accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                        onChange={handleFileUpload} disabled={isDecoding}
                        data-testid="input-file-upload" />
                      <Button asChild
                        className="rounded-none w-full text-xs cursor-pointer bg-[#a78bfa]/15 hover:bg-[#a78bfa]/25 text-[#a78bfa] border border-[#a78bfa]/30 hover:border-[#a78bfa]/60 h-9">
                        <label htmlFor="file-upload">
                          {isDecoding
                            ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Scanning…</>
                            : <><Upload className="w-4 h-4 mr-2" />Load Image</>}
                        </label>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {decodeError && (
                <Alert variant="destructive" className="rounded-none border-destructive/50 bg-destructive/10">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Decoding Failed</AlertTitle>
                  <AlertDescription className="font-mono text-sm">{decodeError}</AlertDescription>
                </Alert>
              )}

              {decodedMessage && (() => {
                const ptype  = detectPayloadType(decodedMessage);
                const pmeta  = PAYLOAD_META[ptype];
                const typeIcon: Record<PayloadType, React.ReactNode> = {
                  url:      <ExternalLink className="w-4 h-4" />,
                  email:    <Mail        className="w-4 h-4" />,
                  phone:    <Phone       className="w-4 h-4" />,
                  sms:      <MessageSquare className="w-4 h-4" />,
                  geo:      <MapPin      className="w-4 h-4" />,
                  wifi:     <Wifi        className="w-4 h-4" />,
                  vcard:    <User        className="w-4 h-4" />,
                  calendar: <CalendarDays className="w-4 h-4" />,
                  upi:      <CreditCard  className="w-4 h-4" />,
                  text:     <FileText    className="w-4 h-4" />,
                };
                const handleCopy = () => {
                  navigator.clipboard?.writeText(decodedMessage.trim()).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                };
                return (
                <div className="border bg-[#a78bfa]/5 animate-in slide-in-from-top-4 fade-in duration-300"
                  style={{ borderColor: pmeta.color + "55" }}
                  data-testid="decoded-result">

                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b"
                    style={{ borderColor: pmeta.color + "33", backgroundColor: pmeta.color + "0d" }}>
                    <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-sm"
                      style={{ color: pmeta.color }}>
                      {typeIcon[ptype]}
                      {pmeta.label}
                    </div>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-widest border"
                      style={{ color: pmeta.color, borderColor: pmeta.color + "44", backgroundColor: pmeta.color + "15" }}>
                      <Check className="w-3 h-3" /> Decrypted
                    </div>
                  </div>

                  {/* Payload preview */}
                  <div className="px-4 pt-4 pb-3">
                    <div className="font-mono text-xs break-all bg-muted/30 border border-border px-3 py-2 text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {decodedMessage.trim()}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="px-4 pb-4 flex gap-2">
                    <Button
                      onClick={() => triggerPayload(decodedMessage)}
                      className="flex-1 rounded-none h-11 uppercase font-bold tracking-widest text-sm text-black"
                      style={{ backgroundColor: pmeta.color }}
                      data-testid="button-payload-action">
                      {typeIcon[ptype]}
                      <span className="ml-2">{pmeta.action}</span>
                    </Button>
                    <Button
                      onClick={handleCopy}
                      variant="outline"
                      className="rounded-none h-11 w-11 flex-shrink-0 border-border hover:border-[#a78bfa]/50 hover:bg-[#a78bfa]/10 hover:text-[#a78bfa]"
                      title="Copy to clipboard"
                      data-testid="button-copy-payload">
                      {copied ? <Check className="w-4 h-4 text-[#00e5a0]" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

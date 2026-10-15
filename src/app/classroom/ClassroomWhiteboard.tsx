"use client";

import { useEffect, useRef, useState } from "react";
import { useDataChannel, useRoomContext } from "@livekit/components-react";
import {
  Columns2,
  Eraser,
  Highlighter,
  Lock,
  Maximize2,
  Minimize2,
  Pen,
  Trash2,
  Type,
  X,
} from "lucide-react";

interface ClassroomWhiteboardProps {
  onClose: () => void;
  pianoOpen?: boolean;
  isLocked?: boolean;
  isAdmin?: boolean;
}

interface DrawPoint {
  x: number;
  y: number;
}

interface DrawStroke {
  points: DrawPoint[];
  color: string;
  width: number;
  isHighlighter?: boolean;
}

interface TypingState {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  text: string;
}

type ToolType = "pen" | "highlighter" | "eraser" | "text";
type LayoutMode = "full" | "split-left" | "split-right" | "compact";

export default function ClassroomWhiteboard({
  onClose,
  pianoOpen = false,
  isLocked = false,
  isAdmin = false,
}: ClassroomWhiteboardProps) {
  const room = useRoomContext();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const directInputRef = useRef<HTMLInputElement | null>(null);

  const [tool, setTool] = useState<ToolType>("pen");
  const [color, setColor] = useState("#2ed573");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fontSize, setFontSize] = useState(22);
  const [showStaff, setShowStaff] = useState(true);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("full");

  // Direct on-canvas typing position and value
  const [typingState, setTypingState] = useState<TypingState | null>(null);

  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<DrawPoint[]>([]);

  // Draw musical staff lines
  const drawStaffLines = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => {
    if (!showStaff) return;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1.5;

    // Draw 2 staves (Treble and Bass system)
    const staffHeight = 60;
    const lineSpacing = staffHeight / 4;

    const staves = [height * 0.3, height * 0.65];

    staves.forEach((topY) => {
      for (let i = 0; i < 5; i++) {
        const y = topY + i * lineSpacing;
        ctx.beginPath();
        ctx.moveTo(40, y);
        ctx.lineTo(width - 40, y);
        ctx.stroke();
      }
    });

    ctx.restore();
  };

  const drawTextOnCanvas = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    textColor: string,
    size: number,
    width: number,
    height: number
  ) => {
    ctx.save();
    ctx.font = `bold ${size}px "Segoe UI", Roboto, system-ui, sans-serif`;
    ctx.fillStyle = textColor;
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 4;
    ctx.fillText(text, x * width, y * height);
    ctx.restore();
  };

  const drawRemoteStroke = (stroke: DrawStroke) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (stroke.isHighlighter) {
      ctx.globalAlpha = 0.35;
    }

    if (stroke.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(
        stroke.points[0].x * canvas.width,
        stroke.points[0].y * canvas.height
      );
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(
          stroke.points[i].x * canvas.width,
          stroke.points[i].y * canvas.height
        );
      }
      ctx.stroke();
    }
    ctx.restore();
  };

  const clearCanvasLocal = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStaffLines(ctx, canvas.width, canvas.height);
  };

  // Listen to remote whiteboard events (Always active, even when isLocked is true)
  const { send: sendWhiteboard } = useDataChannel("whiteboard_sync", (msg) => {
    try {
      const decoded = new TextDecoder().decode(msg.payload);
      const data = JSON.parse(decoded);
      if (data.type === "stroke") {
        drawRemoteStroke(data.stroke);
      } else if (data.type === "text" && typeof data.text === "string") {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            drawTextOnCanvas(
              ctx,
              data.text,
              data.x,
              data.y,
              data.color || "#2ed573",
              data.size || 22,
              canvas.width,
              canvas.height
            );
          }
        }
      } else if (data.type === "clear") {
        clearCanvasLocal();
      }
    } catch {
      // ignore
    }
  });

  const handleClearAll = () => {
    if (isLocked) return;
    clearCanvasLocal();
    if (sendWhiteboard) {
      const payload = JSON.stringify({ type: "clear" });
      sendWhiteboard(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  // Commit text directly onto canvas and broadcast
  const commitDirectText = (textOverride?: string) => {
    if (!typingState || isLocked) return;
    const textToCommit = (typeof textOverride === "string" ? textOverride : typingState.text).trim();
    if (!textToCommit) {
      setTypingState(null);
      return;
    }

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        drawTextOnCanvas(
          ctx,
          textToCommit,
          typingState.x,
          typingState.y,
          color,
          fontSize,
          canvas.width,
          canvas.height
        );
      }
    }

    if (sendWhiteboard) {
      const payload = JSON.stringify({
        type: "text",
        text: textToCommit,
        x: typingState.x,
        y: typingState.y,
        color,
        size: fontSize,
      });
      sendWhiteboard(new TextEncoder().encode(payload), { reliable: true });
    }

    setTypingState(null);
  };

  const getCoordinates = (
    e: React.MouseEvent | React.TouchEvent
  ): { x: number; y: number; screenX: number; screenY: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return {
      x: screenX / rect.width,
      y: screenY / rect.height,
      screenX,
      screenY,
    };
  };

  // Direct pointer click to type or draw
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (isLocked) return;
    const pt = getCoordinates(e);
    if (!pt) return;

    if (tool === "text") {
      if (typingState && typingState.text.trim()) {
        commitDirectText();
      }
      setTypingState({
        x: pt.x,
        y: pt.y,
        screenX: pt.screenX,
        screenY: pt.screenY,
        text: "",
      });
      return;
    }

    if (typingState) commitDirectText();

    isDrawingRef.current = true;
    currentStrokeRef.current = [{ x: pt.x, y: pt.y }];

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.strokeStyle = tool === "eraser" ? "#16201a" : color;
    ctx.lineWidth = tool === "eraser" ? 22 : strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (tool === "highlighter") ctx.globalAlpha = 0.35;

    ctx.beginPath();
    ctx.moveTo(pt.x * canvas.width, pt.y * canvas.height);
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (isLocked || tool === "text" || !isDrawingRef.current) return;
    const pt = getCoordinates(e);
    if (!pt) return;

    currentStrokeRef.current.push({ x: pt.x, y: pt.y });

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    if (isLocked || tool === "text" || !isDrawingRef.current) return;
    isDrawingRef.current = false;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.restore();

    if (currentStrokeRef.current.length > 1 && sendWhiteboard) {
      const stroke: DrawStroke = {
        points: currentStrokeRef.current,
        color: tool === "eraser" ? "#16201a" : color,
        width: tool === "eraser" ? 22 : strokeWidth,
        isHighlighter: tool === "highlighter",
      };
      const payload = JSON.stringify({ type: "stroke", stroke });
      sendWhiteboard(new TextEncoder().encode(payload), { reliable: true });
    }
    currentStrokeRef.current = [];
  };

  // Preserve existing canvas drawing when resized or layout toggled
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const prevWidth = canvas.width;
    const prevHeight = canvas.height;
    let tempCanvas: HTMLCanvasElement | null = null;

    if (prevWidth > 0 && prevHeight > 0) {
      tempCanvas = document.createElement("canvas");
      tempCanvas.width = prevWidth;
      tempCanvas.height = prevHeight;
      const tempCtx = tempCanvas.getContext("2d");
      if (tempCtx) {
        tempCtx.drawImage(canvas, 0, 0);
      }
    }

    const nextWidth = parent.clientWidth || 700;
    const nextHeight = parent.clientHeight || 450;

    canvas.width = nextWidth;
    canvas.height = nextHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      if (tempCanvas && tempCanvas.width > 0) {
        ctx.drawImage(tempCanvas, 0, 0, nextWidth, nextHeight);
      } else {
        drawStaffLines(ctx, nextWidth, nextHeight);
      }
    }
  }, [showStaff, layoutMode, pianoOpen]);

  // Focus input when typing state activates
  useEffect(() => {
    if (typingState && directInputRef.current) {
      directInputRef.current.focus();
    }
  }, [typingState]);

  const insertSymbol = (sym: string) => {
    if (isLocked) return;
    if (!typingState) {
      const canvas = canvasRef.current;
      const cx = canvas ? canvas.width / 2 : 250;
      const cy = canvas ? canvas.height / 2 : 150;
      setTypingState({
        x: 0.5,
        y: 0.5,
        screenX: cx,
        screenY: cy,
        text: sym,
      });
      return;
    }
    setTypingState((prev) => (prev ? { ...prev, text: prev.text + sym } : null));
    directInputRef.current?.focus();
  };

  const getContainerStyle = (): React.CSSProperties => {
    const baseBottom = pianoOpen ? 215 : 20;

    switch (layoutMode) {
      case "split-left":
        return {
          position: "absolute",
          top: 55,
          left: 20,
          right: "auto",
          width: "calc(50% - 25px)",
          bottom: baseBottom,
          zIndex: 100,
        };
      case "split-right":
        return {
          position: "absolute",
          top: 55,
          left: "auto",
          right: 20,
          width: "calc(50% - 25px)",
          bottom: baseBottom,
          zIndex: 100,
        };
      case "compact":
        return {
          position: "absolute",
          top: 55,
          left: 20,
          right: "auto",
          width: 520,
          height: 380,
          zIndex: 100,
        };
      case "full":
      default:
        return {
          position: "absolute",
          top: 55,
          left: 20,
          right: 20,
          bottom: baseBottom,
          zIndex: 100,
        };
    }
  };

  return (
    <div
      ref={containerRef}
      className="pc-whiteboard-modal"
      style={{
        ...getContainerStyle(),
        background: "#16201a",
        border: `1px solid ${
          isLocked ? "rgba(255, 177, 66, 0.4)" : "rgba(255, 255, 255, 0.22)"
        }`,
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 16px 50px rgba(0,0,0,0.85)",
        overflow: "hidden",
        transition:
          "width 0.2s ease, left 0.2s ease, right 0.2s ease, bottom 0.2s ease",
      }}
    >
      {/* Whiteboard Toolbar */}
      <div
        style={{
          minHeight: 48,
          background: "#1b2921",
          borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
          padding: "6px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <strong
            style={{
              fontSize: 13,
              color: isLocked ? "#ffb142" : "#2ed573",
              whiteSpace: "nowrap",
            }}
          >
            Music Staff &amp; Whiteboard
          </strong>

          {/* Tools Selector or View-Only Badge */}
          {isLocked ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(255, 177, 66, 0.18)",
                border: "1px solid rgba(255, 177, 66, 0.4)",
                padding: "4px 10px",
                borderRadius: 6,
                color: "#ffb142",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              <Lock size={12} />
              <span>View Only (Presenter Mode) · Live Teacher Sync</span>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  gap: 3,
                  background: "rgba(0,0,0,0.3)",
                  padding: 3,
                  borderRadius: 6,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (typingState) commitDirectText();
                    setTool("pen");
                  }}
                  style={{
                    background: tool === "pen" ? "#2ed573" : "transparent",
                    color: tool === "pen" ? "#000" : "#fff",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Pen size={12} /> Pen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (typingState) commitDirectText();
                    setTool("text");
                  }}
                  style={{
                    background: tool === "text" ? "#2ed573" : "transparent",
                    color: tool === "text" ? "#000" : "#fff",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 8px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                  title="Click anywhere on the whiteboard to type directly"
                >
                  <Type size={12} /> Direct Type
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (typingState) commitDirectText();
                    setTool("highlighter");
                  }}
                  style={{
                    background:
                      tool === "highlighter" ? "#ffb142" : "transparent",
                    color: tool === "highlighter" ? "#000" : "#fff",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Highlighter size={12} /> Highlight
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (typingState) commitDirectText();
                    setTool("eraser");
                  }}
                  style={{
                    background: tool === "eraser" ? "#ff4757" : "transparent",
                    color: "#fff",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Eraser size={12} /> Eraser
                </button>
              </div>

              {tool === "text" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    background: "rgba(0,0,0,0.35)",
                    padding: "2px 8px",
                    borderRadius: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 10, color: "#8fcaab" }}>Font:</span>
                  {[
                    { label: "Sm (16)", size: 16 },
                    { label: "Md (22)", size: 22 },
                    { label: "Lg (30)", size: 30 },
                  ].map((f) => (
                    <button
                      key={f.size}
                      type="button"
                      onClick={() => setFontSize(f.size)}
                      style={{
                        background:
                          fontSize === f.size ? "#2ed573" : "transparent",
                        color: fontSize === f.size ? "#000" : "#fff",
                        border: "none",
                        borderRadius: 3,
                        padding: "2px 5px",
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}

                  <span
                    style={{
                      fontSize: 10,
                      color: "#8fcaab",
                      marginLeft: 4,
                      borderLeft: "1px solid rgba(255,255,255,0.2)",
                      paddingLeft: 6,
                    }}
                  >
                    Insert:
                  </span>
                  {["♯", "♭", "♮", "♩", "♪", "♫", "Am", "C", "G"].map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => insertSymbol(sym)}
                      style={{
                        background: "rgba(255,255,255,0.12)",
                        border: "none",
                        borderRadius: 3,
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 5px",
                        cursor: "pointer",
                      }}
                      title={`Insert ${sym}`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              )}

              {tool !== "eraser" && (
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  {["#2ed573", "#ff4757", "#ffb142", "#70a1ff", "#ffffff"].map(
                    (c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          background: c,
                          border:
                            color === c
                              ? "2px solid #fff"
                              : "1px solid rgba(0,0,0,0.4)",
                          cursor: "pointer",
                        }}
                      />
                    )
                  )}
                </div>
              )}
            </>
          )}

          {/* Staff Lines Toggle */}
          <button
            type="button"
            onClick={() => setShowStaff((prev) => !prev)}
            style={{
              background: showStaff
                ? "rgba(46, 213, 115, 0.2)"
                : "rgba(255,255,255,0.1)",
              border: `1px solid ${
                showStaff ? "#2ed573" : "rgba(255,255,255,0.2)"
              }`,
              color: showStaff ? "#2ed573" : "#fff",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 11,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {showStaff ? "Staff Lines: ON" : "Blank Canvas"}
          </button>
        </div>

        {/* Layout Sizing & Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              background: "rgba(0,0,0,0.35)",
              padding: 2,
              borderRadius: 6,
            }}
          >
            <button
              type="button"
              onClick={() => setLayoutMode("full")}
              title="Full Width (Auto-clears piano below)"
              style={{
                background: layoutMode === "full" ? "#2ed573" : "transparent",
                color: layoutMode === "full" ? "#000" : "#aaa",
                border: "none",
                borderRadius: 4,
                padding: "3px 6px",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <Maximize2 size={11} /> Full
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode("split-left")}
              title="Split Left 50% (Use side-by-side with video or tuner)"
              style={{
                background:
                  layoutMode === "split-left" ? "#2ed573" : "transparent",
                color: layoutMode === "split-left" ? "#000" : "#aaa",
                border: "none",
                borderRadius: 4,
                padding: "3px 6px",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <Columns2 size={11} /> Half L
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode("split-right")}
              title="Split Right 50%"
              style={{
                background:
                  layoutMode === "split-right" ? "#2ed573" : "transparent",
                color: layoutMode === "split-right" ? "#000" : "#aaa",
                border: "none",
                borderRadius: 4,
                padding: "3px 6px",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <Columns2 size={11} /> Half R
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode("compact")}
              title="Compact Floating Window"
              style={{
                background:
                  layoutMode === "compact" ? "#2ed573" : "transparent",
                color: layoutMode === "compact" ? "#000" : "#aaa",
                border: "none",
                borderRadius: 4,
                padding: "3px 6px",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <Minimize2 size={11} /> Compact
            </button>
          </div>

          {!isLocked && (
            <button
              type="button"
              onClick={handleClearAll}
              style={{
                background: "rgba(255, 71, 87, 0.15)",
                border: "1px solid rgba(255, 71, 87, 0.3)",
                color: "#ff4757",
                borderRadius: 4,
                padding: "4px 8px",
                fontSize: 11,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Trash2 size={12} /> Clear
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#aaa",
              cursor: "pointer",
              padding: 2,
            }}
            title="Close Whiteboard"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Canvas Area with Direct On-Canvas Typing */}
      <div
        style={{
          flex: 1,
          position: "relative",
          cursor: isLocked ? "default" : tool === "text" ? "text" : "crosshair",
          touchAction: "none",
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          style={{ width: "100%", height: "100%", display: "block" }}
        />

        {/* DIRECT ON-CANVAS TYPING: Borderless transparent input placed directly where clicked */}
        {typingState && !isLocked && (
          <input
            ref={directInputRef}
            type="text"
            value={typingState.text}
            placeholder="Type directly here…"
            onChange={(e) =>
              setTypingState((prev) =>
                prev ? { ...prev, text: e.target.value } : null
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const committedX = typingState.x;
                const committedScreenX = typingState.screenX;
                const committedScreenY = typingState.screenY;
                commitDirectText();
                const canvas = canvasRef.current;
                if (canvas) {
                  const nextScreenY = committedScreenY + fontSize * 1.35;
                  if (nextScreenY < canvas.height - 20) {
                    setTypingState({
                      x: committedX,
                      y: nextScreenY / canvas.height,
                      screenX: committedScreenX,
                      screenY: nextScreenY,
                      text: "",
                    });
                  }
                }
              } else if (e.key === "Escape") {
                setTypingState(null);
              }
            }}
            onBlur={() => commitDirectText()}
            style={{
              position: "absolute",
              left: typingState.screenX,
              top: typingState.screenY - fontSize * 0.6,
              background: "transparent",
              border: "none",
              borderBottom: `2px dashed ${color}`,
              color: color,
              font: `bold ${fontSize}px "Segoe UI", Roboto, system-ui, sans-serif`,
              lineHeight: 1,
              padding: "0 2px",
              margin: 0,
              outline: "none",
              zIndex: 50,
              minWidth: 120,
              maxWidth: `calc(100% - ${typingState.screenX}px - 16px)`,
              caretColor: color,
              textShadow: "0 1px 4px rgba(0,0,0,0.9)",
            }}
          />
        )}
      </div>
    </div>
  );
}

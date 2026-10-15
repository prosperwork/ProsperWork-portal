"use client";

import { useEffect, useRef, useState } from "react";
import { useDataChannel, useRoomContext } from "@livekit/components-react";
import {
  Eraser,
  Highlighter,
  Pen,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

interface ClassroomWhiteboardProps {
  onClose: () => void;
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

export default function ClassroomWhiteboard({ onClose }: ClassroomWhiteboardProps) {
  const room = useRoomContext();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<"pen" | "highlighter" | "eraser">("pen");
  const [color, setColor] = useState("#2ed573");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [showStaff, setShowStaff] = useState(true);

  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<DrawPoint[]>([]);

  // Listen to remote drawing events
  const { send: sendWhiteboard } = useDataChannel("whiteboard_sync", (msg) => {
    try {
      const decoded = new TextDecoder().decode(msg.payload);
      const data = JSON.parse(decoded);
      if (data.type === "stroke") {
        drawRemoteStroke(data.stroke);
      } else if (data.type === "clear") {
        clearCanvasLocal();
      }
    } catch {
      // ignore
    }
  });

  const drawStaffLines = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
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

  const clearCanvasLocal = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStaffLines(ctx, canvas.width, canvas.height);
  };

  const handleClearAll = () => {
    clearCanvasLocal();
    if (sendWhiteboard) {
      const payload = JSON.stringify({ type: "clear" });
      sendWhiteboard(new TextEncoder().encode(payload), { reliable: true });
    }
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
      ctx.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * canvas.width, stroke.points[i].y * canvas.height);
      }
      ctx.stroke();
    }
    ctx.restore();
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): DrawPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const pt = getCoordinates(e);
    if (!pt) return;
    isDrawingRef.current = true;
    currentStrokeRef.current = [pt];

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

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return;
    const pt = getCoordinates(e);
    if (!pt) return;

    currentStrokeRef.current.push(pt);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
    ctx.stroke();
  };

  const endDrawing = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.restore();

    // Broadcast stroke
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Set actual render resolution
    canvas.width = canvas.parentElement?.clientWidth || 700;
    canvas.height = canvas.parentElement?.clientHeight || 450;
    const ctx = canvas.getContext("2d");
    if (ctx) drawStaffLines(ctx, canvas.width, canvas.height);
  }, [showStaff]);

  return (
    <div
      className="pc-whiteboard-modal"
      style={{
        position: "absolute",
        top: 55,
        left: 20,
        right: 20,
        bottom: 20,
        background: "#16201a",
        border: "1px solid rgba(255, 255, 255, 0.22)",
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 16px 50px rgba(0,0,0,0.8)",
        zIndex: 100,
        overflow: "hidden",
      }}
    >
      {/* Whiteboard Toolbar */}
      <div
        style={{
          height: 48,
          background: "#1b2921",
          borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
          padding: "0 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong style={{ fontSize: 13, color: "#2ed573" }}>Music Staff &amp; Whiteboard</strong>

          {/* Tools */}
          <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.3)", padding: 3, borderRadius: 6 }}>
            <button
              type="button"
              onClick={() => setTool("pen")}
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
              onClick={() => setTool("highlighter")}
              style={{
                background: tool === "highlighter" ? "#ffb142" : "transparent",
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
              onClick={() => setTool("eraser")}
              style={{
                background: tool === "eraser" ? "#ff4757" : "transparent",
                color: tool === "eraser" ? "#fff" : "#fff",
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

          {/* Colors */}
          {tool !== "eraser" && (
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              {["#2ed573", "#ff4757", "#ffb142", "#70a1ff", "#ffffff"].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: c,
                    border: color === c ? "2px solid #fff" : "1px solid rgba(0,0,0,0.4)",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>
          )}

          {/* Staff Lines Toggle */}
          <button
            type="button"
            onClick={() => setShowStaff((prev) => !prev)}
            style={{
              background: showStaff ? "rgba(46, 213, 115, 0.2)" : "rgba(255,255,255,0.1)",
              border: `1px solid ${showStaff ? "#2ed573" : "rgba(255,255,255,0.2)"}`,
              color: showStaff ? "#2ed573" : "#fff",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {showStaff ? "Staff Lines: ON" : "Blank Canvas"}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
            <Trash2 size={12} /> Clear Board
          </button>
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
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: "relative", cursor: "crosshair", touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={endDrawing}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>
    </div>
  );
}


/**
 * ProsperWork Music Academy - Strict Admissions Intake AI Engine
 * Powered by Groq AI (openai/gpt-oss-120b)
 *
 * Dynamically fetches instruments from pw_catalog_items and pricing from pw_settings.
 * Strictly collects:
 * 1. Student Name
 * 2. Student Age
 * 3. Instrument
 *
 * Once all three are collected, immediately notifies customer:
 * "Thank you! One of our administrators will contact you shortly."
 */

import { provisioningClient } from "@/lib/supabase/server";

interface WhatsAppReplyContext {
  parentName?: string;
  senderPhone: string;
  incomingMessage: string;
  knownStudentName?: string;
  knownAge?: string;
  knownInstrument?: string;
  leadStage?: string;
  intakeComplete?: boolean;
  history?: Array<{
    role: "assistant" | "user";
    content: string;
  }>;
}

export interface StrictIntakeResult {
  replyText: string;
  studentName?: string;
  studentAge?: string;
  detectedInstrument?: string;
  isComplete: boolean;
}

/**
 * Dynamically fetch active catalog instruments and pricing from database
 */
export async function fetchAcademyCatalogAndSettings(): Promise<{
  instruments: string[];
  pricingText: string;
}> {
  try {
    const db = provisioningClient();
    const [instRes, settRes] = await Promise.all([
      db
        .from("pw_catalog_items")
        .select("label, code")
        .eq("catalog", "instruments")
        .eq("enabled", true)
        .order("sort_order", { ascending: true }),
      db
        .from("pw_settings")
        .select("settings")
        .eq("singleton", true)
        .maybeSingle(),
    ]);

    const instruments = (instRes.data || [])
      .map((d: any) => d.label || d.code)
      .filter(Boolean);

    const settings = (settRes.data?.settings as any) || {};
    const pricingText =
      settings.pricing?.standardRate ||
      settings.pricing?.summary ||
      "Weekly 1-on-1 personalized sessions";

    return {
      instruments: instruments.length > 0 ? instruments : ["Piano", "Guitar", "Violin", "Singing", "Drums", "Saxophone"],
      pricingText,
    };
  } catch {
    return {
      instruments: ["Piano", "Guitar", "Violin", "Singing", "Drums", "Saxophone"],
      pricingText: "Weekly 1-on-1 personalized sessions",
    };
  }
}

export async function generateSmartWhatsAppAIReply(
  ctx: WhatsAppReplyContext
): Promise<StrictIntakeResult | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim() || "";

  if (!apiKey) {
    return null;
  }

  const rawName = ctx.parentName || "there";
  const cleanFirstName =
    rawName.includes("<test") || rawName.toLowerCase().includes("dummy")
      ? "there"
      : rawName.trim().split(" ")[0] || "there";

  // If intake was already completed in a prior turn, reassure customer
  if (ctx.intakeComplete) {
    return {
      replyText: `Thank you! Your information has been received and one of our administrators will contact you shortly.`,
      studentName: ctx.knownStudentName,
      studentAge: ctx.knownAge,
      detectedInstrument: ctx.knownInstrument,
      isComplete: true,
    };
  }

  // Dynamically fetch active instruments and pricing from the database
  const { instruments, pricingText } = await fetchAcademyCatalogAndSettings();

  // Pre-seed known values if provided
  const existingName = ctx.knownStudentName && ctx.knownStudentName !== "Unknown" ? ctx.knownStudentName : null;
  const existingAge = ctx.knownAge && ctx.knownAge !== "Unknown" ? ctx.knownAge : null;
  let existingInstrument = ctx.knownInstrument && ctx.knownInstrument !== "Unknown" ? ctx.knownInstrument : null;

  // Dynamic heuristic for instrument matching from catalog
  const lowerMsg = ctx.incomingMessage.toLowerCase();
  for (const inst of instruments) {
    if (lowerMsg.includes(inst.toLowerCase())) {
      existingInstrument = inst;
      break;
    }
  }

  const systemPrompt = `You are the strict admissions intake assistant for ProsperWork Music Academy.
Your sole job is to strictly collect exactly three pieces of information from the customer:
1. student_name: The name of the student/child. (Do NOT assume the parent's name unless they explicitly say they are the student).
2. student_age: The age of the student (e.g. 7, 10, or adult).
3. instrument: The musical instrument they want to learn. Available academy instruments: ${instruments.join(", ")}.

Current known values:
- student_name: ${existingName ? JSON.stringify(existingName) : "null"}
- student_age: ${existingAge ? JSON.stringify(existingAge) : "null"}
- instrument: ${existingInstrument ? JSON.stringify(existingInstrument) : "null"}

Academy context:
- Lesson rates: ${pricingText}.
- Complimentary trial assessment is available.

Strict Rules:
- Analyze the user message and conversation history to extract any new or missing values.
- If all 3 items (student_name, student_age, instrument) are now known, set "is_complete": true and set "reply_text" to:
  "Thank you! One of our administrators will contact you shortly."
- If any items are still missing, set "is_complete": false, and in "reply_text" politely and directly ask ONLY for the missing items in 1 concise sentence.
- If the customer asks a general question, answer it in 1 short sentence and immediately ask for whichever of {student_name, student_age, instrument} is still missing.
- You must respond ONLY with a valid JSON object matching this exact schema:
  {
    "student_name": string or null,
    "student_age": string or null,
    "instrument": string or null,
    "is_complete": boolean,
    "reply_text": string
  }`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  if (Array.isArray(ctx.history) && ctx.history.length > 0) {
    const recent = ctx.history.slice(-4);
    for (const h of recent) {
      if (h.content?.trim()) {
        messages.push({
          role: h.role,
          content: h.content.trim(),
        });
      }
    }
  }

  messages.push({
    role: "user",
    content: ctx.incomingMessage.trim(),
  });

  const modelsToTry = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];

  for (const model of modelsToTry) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 180,
        }),
      });

      if (!res.ok) continue;

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) continue;

      const parsed = JSON.parse(content);
      const studentName = parsed.student_name || existingName || undefined;
      const studentAge = parsed.student_age || existingAge || undefined;
      const instrument = parsed.instrument || existingInstrument || undefined;
      const isComplete = Boolean(
        parsed.is_complete || (studentName && studentAge && instrument)
      );

      let replyText = parsed.reply_text?.trim();
      if (isComplete) {
        replyText = "Thank you! One of our administrators will contact you shortly.";
      } else if (!replyText) {
        const missing: string[] = [];
        if (!studentName) missing.push("your child's name");
        if (!studentAge) missing.push("their age");
        if (!instrument) missing.push("the musical instrument they want to learn");
        replyText = `Could you please provide ${missing.join(", ")}?`;
      }

      return {
        replyText,
        studentName,
        studentAge,
        detectedInstrument: instrument,
        isComplete,
      };
    } catch {
      // try next model
    }
  }

  // Fallback
  return {
    replyText: `Thank you, ${cleanFirstName}! Could you please tell us your child's name, age, and musical instrument of interest?`,
    studentName: existingName || undefined,
    studentAge: existingAge || undefined,
    detectedInstrument: existingInstrument || undefined,
    isComplete: false,
  };
}

const fs = require("fs");
const { PDFParse } = require("pdf-parse");

const ANSWER = "\u7b54\u6848\uff1a";
const ANALYSIS = "\u89e3\u6790\uff1a";

function cleanText(text) {
  return text
    .replace(/\r/g, "")
    .replace(/\n-- \d+ of \d+ --\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function findQuestionStarts(text) {
  const starts = [];
  const re = /(^|\n)(\d+|[一二三四五六七八九十百]+)[\.．、]?[\.．]?\s*/g;
  let match;
  while ((match = re.exec(text))) {
    const idx = match.index + (match[1] ? 1 : 0);
    const tail = text.slice(re.lastIndex, re.lastIndex + 40);
    if (tail.includes(ANSWER) || /[\u4e00-\u9fa5A-Z]/.test(tail)) {
      starts.push({ idx, num: match[2] });
    }
  }
  return starts;
}

function splitAnswer(text) {
  const answerIndex = text.indexOf(ANSWER);
  if (answerIndex === -1) return null;
  const prompt = text.slice(0, answerIndex).trim();
  const answerPart = text.slice(answerIndex + ANSWER.length).trim();
  const analysisIndex = answerPart.indexOf(ANALYSIS);
  if (analysisIndex === -1) {
    return {
      prompt,
      answer: answerPart.trim(),
      analysis: "",
    };
  }
  return {
    prompt,
    answer: answerPart.slice(0, analysisIndex).trim(),
    analysis: answerPart.slice(analysisIndex + ANALYSIS.length).trim(),
  };
}

function parseChoiceSegments(text) {
  const starts = findQuestionStarts(text);
  const segments = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i].idx;
    const end = i + 1 < starts.length ? starts[i + 1].idx : text.length;
    const segment = text.slice(start, end).trim();
    if (segment.includes(ANSWER)) segments.push(segment);
  }

  return segments
    .map((segment) => {
      const parts = splitAnswer(segment);
      if (!parts || !/^[A-E]+$/.test(parts.answer)) return null;
      const numberMatch = parts.prompt.match(/^(\d+)/);
      const options = Array.from(new Set(Array.from(parts.prompt.matchAll(/(^|\s)([A-E])\./g), (m) => m[2])));
      return {
        type: parts.answer.length === 1 ? "single" : "multiple",
        sourceNumber: numberMatch ? numberMatch[1] : "",
        prompt: parts.prompt,
        options,
        answer: parts.answer,
        analysis: parts.analysis,
      };
    })
    .filter(Boolean);
}

function parseSubjectiveSegments(text) {
  const starts = findQuestionStarts(text);
  const segments = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i].idx;
    const end = i + 1 < starts.length ? starts[i + 1].idx : text.length;
    const segment = text.slice(start, end).trim();
    if (segment.includes(ANSWER)) segments.push(segment);
  }

  return segments
    .map((segment) => {
      const parts = splitAnswer(segment);
      if (!parts || /^[A-E]+$/.test(parts.answer)) return null;
      const numberMatch = parts.prompt.match(/^(\d+)/);
      return {
        type: "subjective",
        sourceNumber: numberMatch ? numberMatch[1] : "",
        prompt: parts.prompt,
        answer: parts.answer,
        analysis: parts.analysis,
      };
    })
    .filter(Boolean);
}

function parseJudgementSegments(text, afterIndex, beforeIndex) {
  const area = text.slice(afterIndex, beforeIndex).trim();
  const starts = [];
  const re = /(^|\n)(\d+)．/g;
  let match;
  while ((match = re.exec(area))) {
    starts.push({ idx: match.index + (match[1] ? 1 : 0), num: match[2] });
  }

  const result = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i].idx;
    const end = i + 1 < starts.length ? starts[i + 1].idx : area.length;
    const segment = area.slice(start, end).trim();
    const answerMatch = segment.match(/(?:-\s*)*(正确|错误)\s*$/);
    if (!answerMatch) continue;
    result.push({
      type: "judgement",
      sourceNumber: starts[i].num,
      prompt: segment.slice(0, answerMatch.index).replace(/\s*-+\s*$/g, "").trim(),
      answer: answerMatch[1],
      analysis: "",
    });
  }
  return result;
}

async function main() {
  const pdfFile = fs.readdirSync(".").find((file) => file.toLowerCase().endsWith(".pdf"));
  if (!pdfFile) throw new Error("No PDF file found.");

  const parser = new PDFParse({ data: fs.readFileSync(pdfFile) });
  const result = await parser.getText();
  await parser.destroy();

  const text = cleanText(result.text);
  const choices = parseChoiceSegments(text);
  const subjectives = parseSubjectiveSegments(text);
  const lastChoice = choices[choices.length - 1];
  const lastChoiceNeedle = `${lastChoice.prompt}\n${ANSWER}${lastChoice.answer}`;
  const judgementStart = text.indexOf(lastChoiceNeedle);
  const judgementAfter = judgementStart === -1 ? 0 : judgementStart + lastChoiceNeedle.length;
  const subjectiveStart = text.indexOf(subjectives[0].prompt);
  const judgements = parseJudgementSegments(text, judgementAfter, subjectiveStart);

  const questions = [...choices, ...judgements, ...subjectives].map((question, index) => ({
    id: `q${String(index + 1).padStart(4, "0")}`,
    index: index + 1,
    ...question,
  }));

  const output = {
    sourceFile: pdfFile,
    extractedAt: new Date().toISOString(),
    counts: {
      total: questions.length,
      single: questions.filter((q) => q.type === "single").length,
      multiple: questions.filter((q) => q.type === "multiple").length,
      judgement: questions.filter((q) => q.type === "judgement").length,
      subjective: questions.filter((q) => q.type === "subjective").length,
    },
    questions,
  };

  fs.writeFileSync("questions-data.js", `window.QUESTION_BANK = ${JSON.stringify(output, null, 2)};\n`, "utf8");
  console.log(output.counts);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

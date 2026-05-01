/** Generate placeholder lorem ipsum text. */

const WORDS = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
  "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
  "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
  "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
  "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
  "velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint",
  "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia",
  "deserunt", "mollit", "anim", "id", "est", "laborum",
];

function randWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function makeSentence(words: number): string {
  const arr = Array.from({ length: words }, randWord);
  arr[0] = arr[0][0].toUpperCase() + arr[0].slice(1);
  // Insert occasional commas
  for (let i = 3; i < arr.length - 2; i += Math.floor(Math.random() * 5) + 3) {
    arr[i] = arr[i] + ",";
  }
  return arr.join(" ") + ".";
}

function makeParagraph(sentences: number): string {
  return Array.from({ length: sentences }, () =>
    makeSentence(8 + Math.floor(Math.random() * 12)),
  ).join(" ");
}

export async function lorem_ipsum(input: Record<string, unknown>): Promise<string> {
  const unit = (input["unit"] as string) || "paragraphs";
  const count = typeof input["count"] === "number" ? Math.min(input["count"], 100) : 3;
  const startsClassic = input["classic"] !== false;

  const classic = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

  if (unit === "words") {
    const arr = Array.from({ length: count }, randWord);
    if (startsClassic) {
      const intro = ["lorem", "ipsum", "dolor", "sit", "amet"];
      for (let i = 0; i < Math.min(intro.length, arr.length); i++) arr[i] = intro[i];
    }
    return arr.join(" ");
  }

  if (unit === "sentences") {
    const sentences: string[] = [];
    for (let i = 0; i < count; i++) {
      sentences.push(i === 0 && startsClassic ? classic : makeSentence(8 + Math.floor(Math.random() * 12)));
    }
    return sentences.join(" ");
  }

  // paragraphs
  const paragraphs: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i === 0 && startsClassic) {
      paragraphs.push(classic + " " + makeParagraph(3 + Math.floor(Math.random() * 4)));
    } else {
      paragraphs.push(makeParagraph(3 + Math.floor(Math.random() * 5)));
    }
  }
  return paragraphs.join("\n\n");
}

export const def = {
  name: "lorem_ipsum",
  description:
    "Generate placeholder lorem ipsum text. Configure the unit (words, sentences, paragraphs) and count. Optionally starts with the classic 'Lorem ipsum dolor sit amet...' opening.",
  parameters: {
    type: "object",
    properties: {
      unit: {
        type: "string",
        enum: ["words", "sentences", "paragraphs"],
        description: "Unit to generate (default: paragraphs)",
      },
      count: {
        type: "number",
        description: "Number of units (default: 3, max: 100)",
      },
      classic: {
        type: "boolean",
        description: "Begin with classic 'Lorem ipsum...' opening (default: true)",
      },
    },
    required: [],
  },
};

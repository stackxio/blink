/** Generate fake/random data: names, emails, sentences, numbers. */

const FIRST_NAMES = ["Alex", "Jordan", "Sam", "Taylor", "Morgan", "Casey", "Robin", "Jamie", "Quinn", "Blake", "Drew", "Avery", "Riley", "Skyler", "Hayden", "Reese"];
const LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas"];
const DOMAINS = ["example.com", "test.org", "demo.net", "sample.io", "fake.co", "mock.dev"];
const CITIES = ["New York", "London", "Tokyo", "Paris", "Berlin", "Sydney", "Toronto", "Dubai", "Singapore", "Mumbai"];
const COMPANIES = ["Acme Corp", "Globex", "Initech", "Hooli", "Pied Piper", "Dunder Mifflin", "Stark Industries", "Wayne Enterprises", "Cyberdyne", "Vandelay"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function random_data(input: Record<string, unknown>): Promise<string> {
  const type = (input["type"] as string) || "person";
  const count = Math.min(typeof input["count"] === "number" ? input["count"] : 5, 100);

  const make = (): unknown => {
    switch (type) {
      case "name": return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      case "email": {
        const first = pick(FIRST_NAMES).toLowerCase();
        const last = pick(LAST_NAMES).toLowerCase();
        return `${first}.${last}@${pick(DOMAINS)}`;
      }
      case "phone": return `+1-${randInt(200, 999)}-${randInt(200, 999)}-${String(randInt(0, 9999)).padStart(4, "0")}`;
      case "city": return pick(CITIES);
      case "company": return pick(COMPANIES);
      case "uuid": return crypto.randomUUID();
      case "int": return randInt(0, 1_000_000);
      case "float": return parseFloat((Math.random() * 1000).toFixed(4));
      case "bool": return Math.random() < 0.5;
      case "color": return `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
      case "ip": return `${randInt(1, 255)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(0, 255)}`;
      case "person": {
        const first = pick(FIRST_NAMES);
        const last = pick(LAST_NAMES);
        return {
          name: `${first} ${last}`,
          email: `${first.toLowerCase()}.${last.toLowerCase()}@${pick(DOMAINS)}`,
          age: randInt(18, 80),
          city: pick(CITIES),
          company: pick(COMPANIES),
        };
      }
      default: return null;
    }
  };

  const items = Array.from({ length: count }, make);
  if (typeof items[0] === "object" && items[0] !== null) {
    return JSON.stringify(items, null, 2);
  }
  return items.map((i) => String(i)).join("\n");
}

export const def = {
  name: "random_data",
  description:
    "Generate fake test data. Types: name, email, phone, city, company, uuid, int, float, bool, color (hex), ip, person (object with multiple fields).",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["name", "email", "phone", "city", "company", "uuid", "int", "float", "bool", "color", "ip", "person"],
        description: "Type of data to generate (default: person)",
      },
      count: {
        type: "number",
        description: "Number of items (default: 5, max: 100)",
      },
    },
    required: [],
  },
};

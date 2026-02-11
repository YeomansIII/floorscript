import { singleRoomTemplate } from "../templates/single-room.js";
import { kitchenRenoTemplate } from "../templates/kitchen-reno.js";

const templates: Record<string, string> = {
  "single-room": singleRoomTemplate,
  "kitchen-reno": kitchenRenoTemplate,
};

interface InitOptions {
  template: string;
}

export function initCommand(options: InitOptions): void {
  const tmpl = templates[options.template];
  if (!tmpl) {
    console.error(`Unknown template: ${options.template}`);
    console.error(`Available: ${Object.keys(templates).join(", ")}`);
    process.exit(1);
  }

  process.stdout.write(tmpl);
}

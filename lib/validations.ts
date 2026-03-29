import { z } from "zod";

export const JoinerJobSchema = z.object({
  name: z.string().min(1, "Job name is required"),
  type: z.enum(["diamonds", "prl"]),
  chEntries: z.string().min(1, "At least one CH entry is required"),
  targetSpreadsheetName: z.string().min(1, "Target sheet name is required"),
  sheetName: z.string().default("Consolidated"),
  validationEnabled: z.boolean().default(false),
});

export type JoinerJobInput = z.infer<typeof JoinerJobSchema>;

/**
 * Parse CH entries from textarea input.
 * Each line: "CH Name | URL"
 * Returns structured array.
 */
export function parseChEntries(raw: string): { chName: string; url: string }[] {
  return raw
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const parts = line.split("|").map(s => s.trim());
      if (parts.length >= 2) {
        return { chName: parts[0], url: parts.slice(1).join("|").trim() };
      }
      // If no pipe, treat the whole line as URL with auto-name
      return { chName: `CH ${line.substring(0, 20)}...`, url: parts[0] };
    });
}

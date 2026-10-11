import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export interface JoinerJob {
  id: string;
  name: string;
  type: string;
  spreadsheetId: string;
  reportingSheetGid: string | null;
  secondarySpreadsheetId?: string | null;
  secondaryReportingSheetGid?: string | null;
  targetSpreadsheetId: string | null;
  targetSpreadsheetName?: string | null;
  sheetName: string;
  validationEnabled: boolean;
  gameMode?: string | null;
  userId: string | null;
  isEnabled?: boolean;
  lastRunAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

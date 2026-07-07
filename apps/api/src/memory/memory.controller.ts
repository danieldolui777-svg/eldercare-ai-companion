import {
  Controller,
  Get,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { MemoryService } from "./memory.service";

/**
 * Read/curate the companion's memory of a resident. Lets a caregiver review what
 * the app remembers and remove anything inaccurate — important for trust and for
 * the resident's right to correct their data.
 */
@Controller()
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  @Get("residents/:residentId/memory")
  list(@Param("residentId") residentId: string) {
    return this.memory.listForResident(residentId);
  }

  @Delete("memory/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string) {
    return this.memory.deleteFact(id);
  }
}

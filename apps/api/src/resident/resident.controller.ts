import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ResidentService } from "./resident.service";
import { CreateResidentSchema, UpdateResidentSchema } from "@eldercare/domain";
import { ZodPipe } from "../common/zod.pipe";

@Controller("residents")
export class ResidentController {
  constructor(private readonly service: ResidentService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body(new ZodPipe(CreateResidentSchema)) body: any) {
    return this.service.create(body);
  }

  @Put(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodPipe(UpdateResidentSchema)) body: any,
  ) {
    return this.service.update(id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}

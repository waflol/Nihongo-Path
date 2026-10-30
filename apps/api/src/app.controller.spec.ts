import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";

describe("AppController", () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe("meta", () => {
    it("should return service metadata", () => {
      expect(appController.meta()).toMatchObject({
        name: "Nihongo Path API",
        docs: "api/docs",
      });
    });
  });
});

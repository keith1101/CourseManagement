import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';

describe('SubjectsController', () => {
  let controller: SubjectsController;

  beforeEach(() => {
    controller = new SubjectsController({} as SubjectsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

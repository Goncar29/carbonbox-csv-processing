import { ValidationError } from '../../../shared/domain/errors/DomainError';
import { FileName } from './FileName';

describe('FileName', () => {
  it('accepts a .csv file name and trims spaces', () => {
    const result = FileName.create('  activity-data.csv  ');

    expect(result.isRight()).toBe(true);
    if (result.isRight()) expect(result.value.value).toBe('activity-data.csv');
  });

  it('accepts the extension in any case', () => {
    expect(FileName.create('DATA.CSV').isRight()).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['not a csv', 'data.xlsx'],
    ['extension only', '.csv'],
    ['path with slash', '../etc/data.csv'],
    ['path with backslash', '..\\data.csv'],
    ['too long', `${'a'.repeat(252)}.csv`],
  ])('rejects %s', (_case, raw) => {
    const result = FileName.create(raw);

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(ValidationError);
  });

  it.each([
    ['a NUL character', 'a\u0000b.csv'],
    ['a line break', 'a\r\nb.csv'],
    ['a DEL character', 'a\u007fb.csv'],
  ])('rejects a name with %s, which storage and logs cannot handle safely', (_case, raw) => {
    const result = FileName.create(raw);

    expect(result.isLeft()).toBe(true);
    expect((result.value as ValidationError).message).toBe('File name cannot contain control characters');
  });
});

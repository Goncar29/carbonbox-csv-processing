import { ValidationError } from '../../../shared/domain/errors/DomainError';
import { ActivityData } from './ActivityData';

const validProps = {
  uploadId: 'upload-1',
  category: 'Electricity',
  amount: 150.5,
  unit: 'kWh',
  date: new Date('2024-01-15T00:00:00.000Z'),
};

describe('ActivityData', () => {
  it('creates a record with a generated id', () => {
    const result = ActivityData.create(validProps);

    expect(result.isRight()).toBe(true);
    if (result.isRight()) {
      const activity = result.value;
      expect(activity.id).toEqual(expect.any(String));
      expect(activity.uploadId).toBe('upload-1');
      expect(activity.category).toBe('Electricity');
      expect(activity.amount).toBe(150.5);
      expect(activity.unit).toBe('kWh');
      expect(activity.date.toISOString()).toBe('2024-01-15T00:00:00.000Z');
    }
  });

  it('trims category and unit', () => {
    const result = ActivityData.create({ ...validProps, category: ' Water ', unit: ' m3 ' });

    expect(result.isRight()).toBe(true);
    if (result.isRight()) {
      expect(result.value.category).toBe('Water');
      expect(result.value.unit).toBe('m3');
    }
  });

  it.each([
    ['empty category', { category: '  ' }],
    ['empty unit', { unit: '' }],
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -10 }],
    ['NaN amount', { amount: Number.NaN }],
    ['infinite amount', { amount: Number.POSITIVE_INFINITY }],
    ['invalid date', { date: new Date('not-a-date') }],
    ['empty uploadId', { uploadId: '' }],
  ])('rejects %s', (_case, override) => {
    const result = ActivityData.create({ ...validProps, ...override });

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(ValidationError);
  });
});

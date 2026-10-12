import { ValidationError } from '../../../shared/domain/errors/DomainError';
import { CsvParseResult, CsvParserService, formatRowErrors } from './CsvParserService';

const HEADER = 'category,amount,unit,date';
const parser = new CsvParserService();

const parseOk = (content: string): CsvParseResult => {
  const result = parser.parse(Buffer.from(content));
  if (result.isLeft()) throw new Error(`Expected Right, got: ${result.value.message}`);
  return result.value;
};

const parseFileError = (content: string): string => {
  const result = parser.parse(Buffer.from(content));
  expect(result.isLeft()).toBe(true);
  expect(result.value).toBeInstanceOf(ValidationError);
  return (result.value as ValidationError).message;
};

describe('CsvParserService', () => {
  describe('valid rows', () => {
    it('parses the example from the spec', () => {
      const result = parseOk(
        `${HEADER}\nElectricity,150.5,kWh,2024-01-15\nNatural Gas,75.2,m3,2024-01-16\nTransportation,200,km,2024-01-17\n`,
      );

      expect(result.totalRows).toBe(3);
      expect(result.failedRows).toBe(0);
      expect(result.errors).toEqual([]);
      expect(result.rows[0]).toEqual({
        line: 2,
        category: 'Electricity',
        amount: 150.5,
        unit: 'kWh',
        date: new Date('2024-01-15T00:00:00.000Z'),
      });
      expect(result.rows[2]).toMatchObject({ line: 4, category: 'Transportation', amount: 200 });
    });

    it('handles Windows line endings, BOM, quoted commas and surrounding spaces', () => {
      const result = parseOk(`﻿${HEADER}\r\n"Gas, natural" , 75.2 , m3 , 2024-01-16\r\n`);

      expect(result.errors).toEqual([]);
      expect(result.rows[0]).toMatchObject({ category: 'Gas, natural', amount: 75.2, unit: 'm3' });
    });

    it('accepts header columns in any order and case', () => {
      const result = parseOk('Date,Unit,Amount,Category\n2024-01-15,kWh,10,Electricity\n');

      expect(result.rows[0]).toMatchObject({ category: 'Electricity', amount: 10, unit: 'kWh' });
    });

    it('skips blank lines but keeps real file line numbers', () => {
      const result = parseOk(`${HEADER}\n\nWater,120,m3,2024-01-19\n`);

      expect(result.totalRows).toBe(1);
      expect(result.rows[0].line).toBe(3);
    });
  });

  describe('row errors (upload still COMPLETED)', () => {
    it.each([
      ['empty category', ',10,kWh,2024-01-15', 'category', 'is required', ''],
      ['empty unit', 'Water,10,,2024-01-15', 'unit', 'is required', ''],
      ['empty amount', 'Water,,m3,2024-01-15', 'amount', 'is required', ''],
      ['empty date', 'Water,10,m3,', 'date', 'is required', ''],
      ['amount not a number', 'Water,abc,m3,2024-01-15', 'amount', 'must be a number', 'abc'],
      ['amount with comma decimal', 'Water,"1,5",m3,2024-01-15', 'amount', 'must be a number', '1,5'],
      ['zero amount', 'Water,0,m3,2024-01-15', 'amount', 'must be a positive number', '0'],
      ['negative amount', 'Water,-5,m3,2024-01-15', 'amount', 'must be a positive number', '-5'],
      ['date in another format', 'Water,10,m3,15/01/2024', 'date', 'must be a valid date in YYYY-MM-DD format', '15/01/2024'],
      ['impossible month', 'Water,10,m3,2024-13-01', 'date', 'must be a valid date in YYYY-MM-DD format', '2024-13-01'],
      ['impossible day', 'Water,10,m3,2024-02-30', 'date', 'must be a valid date in YYYY-MM-DD format', '2024-02-30'],
    ])('reports %s with line and column', (_case, row, column, message, value) => {
      const result = parseOk(`${HEADER}\n${row}\n`);

      expect(result.rows).toEqual([]);
      expect(result.failedRows).toBe(1);
      expect(result.errors).toEqual([{ line: 2, column, message, value }]);
    });

    it('accepts a leap day', () => {
      expect(parseOk(`${HEADER}\nWater,10,m3,2024-02-29\n`).errors).toEqual([]);
    });

    it('reports a row with the wrong number of values', () => {
      const result = parseOk(`${HEADER}\nWater,10,m3\n`);

      expect(result.errors).toEqual([
        { line: 2, column: null, message: 'expected 4 values, found 3', value: 'Water,10,m3' },
      ]);
    });

    it('reports every invalid column of a row but counts the row once', () => {
      const result = parseOk(`${HEADER}\n,-1,,2024-99-99\n`);

      expect(result.failedRows).toBe(1);
      expect(result.errors.map((e) => e.column)).toEqual(['category', 'amount', 'unit', 'date']);
    });

    it('keeps valid rows when others fail, even if all rows fail', () => {
      const mixed = parseOk(`${HEADER}\nWater,10,m3,2024-01-15\nWater,-1,m3,2024-01-15\n`);
      expect(mixed).toMatchObject({ totalRows: 2, failedRows: 1 });
      expect(mixed.rows).toHaveLength(1);

      const allInvalid = parseOk(`${HEADER}\nWater,-1,m3,2024-01-15\n`);
      expect(allInvalid).toMatchObject({ totalRows: 1, failedRows: 1, rows: [] });
    });
  });

  describe('file errors (upload FAILED)', () => {
    it.each([
      ['an empty file', '', 'The file is empty'],
      ['a file with only spaces', '  \n \n', 'The file is empty'],
      ['a header without data rows', `${HEADER}\n`, 'The file has no data rows'],
      [
        'a missing column',
        'category,unit,date\nWater,m3,2024-01-15\n',
        'Missing required column(s): amount. Expected header: category,amount,unit,date',
      ],
      [
        'an unexpected column',
        `${HEADER},notes\nWater,1,m3,2024-01-15,x\n`,
        'Unexpected column(s): notes. Expected header: category,amount,unit,date',
      ],
      ['a duplicated column', 'category,amount,amount,unit,date\n', 'Duplicated column(s): amount'],
    ])('rejects %s', (_case, content, message) => {
      expect(parseFileError(content)).toBe(message);
    });

    it('rejects malformed CSV syntax', () => {
      expect(parseFileError(`${HEADER}\n"Water,10,m3,2024-01-15\n`)).toMatch(/^Malformed CSV: /);
    });

    it('rejects a file that is not UTF-8 instead of silently corrupting accented text', () => {
      // "Calefacción" saved by Excel as Windows-1252 / Latin-1: "ó" is the single byte 0xF3.
      const latin1 = Buffer.from(`${HEADER}\nCalefacci\xf3n,10,kWh,2024-01-15\n`, 'latin1');

      const result = parser.parse(latin1);

      expect(result.isLeft()).toBe(true);
      expect((result.value as ValidationError).message).toBe(
        'The file must be UTF-8 encoded. In Excel, use "Save as > CSV UTF-8".',
      );
    });
  });

  describe('real-world content', () => {
    it('keeps accented UTF-8 text intact', () => {
      expect(parseOk(`${HEADER}\nCalefacción,10,kWh,2024-01-15\n`).rows[0].category).toBe('Calefacción');
    });

    it('accepts a quote inside an unquoted value (inch mark) instead of failing the whole file', () => {
      const result = parseOk(`${HEADER}\nWater,1,m3,2024-01-15\nSteel pipe 2",5,kg,2024-01-16\n`);

      expect(result.failedRows).toBe(0);
      expect(result.rows.map((row) => row.category)).toEqual(['Water', 'Steel pipe 2"']);
    });

    it('reports a NUL character as a row error, because the database cannot store it', () => {
      const result = parseOk(`${HEADER}\nWater,1,m3,2024-01-15\nb\u0000x,2,kg,2024-01-16\n`);

      expect(result.rows).toHaveLength(1);
      expect(result.failedRows).toBe(1);
      expect(result.errors).toEqual([
        { line: 3, column: 'category', message: 'contains invalid characters', value: 'b\u0000x' },
      ]);
    });
  });
});

describe('formatRowErrors', () => {
  it('writes one line per error with row, column, reason and value', () => {
    const text = formatRowErrors([
      { line: 3, column: 'amount', message: 'must be a positive number', value: '-5' },
      { line: 7, column: null, message: 'expected 4 values, found 3', value: 'Water,10,m3' },
    ]);

    expect(text).toBe(
      'Row 3, column amount: must be a positive number (value: "-5")\n' +
        'Row 7: expected 4 values, found 3 (value: "Water,10,m3")',
    );
  });

  it('caps the output and says how many errors were left out', () => {
    const errors = Array.from({ length: 105 }, (_, i) => ({
      line: i + 2,
      column: 'unit' as const,
      message: 'is required',
      value: '',
    }));

    const lines = formatRowErrors(errors, 100).split('\n');

    expect(lines).toHaveLength(101);
    expect(lines[100]).toBe('...and 5 more errors');
  });

  it('escapes control characters, because the report is stored in a PostgreSQL text column', () => {
    const text = formatRowErrors([
      { line: 3, column: 'category', message: 'contains invalid characters', value: 'b\u0000x\ty' },
    ]);

    expect(text).toBe('Row 3, column category: contains invalid characters (value: "b\\u0000x\\u0009y")');
    expect(text).not.toMatch(/[\u0000-\u001f]/);
  });

  it('truncates very long values', () => {
    const text = formatRowErrors([{ line: 2, column: 'date', message: 'bad', value: 'x'.repeat(80) }]);

    expect(text).toBe(`Row 2, column date: bad (value: "${'x'.repeat(47)}...")`);
  });
});

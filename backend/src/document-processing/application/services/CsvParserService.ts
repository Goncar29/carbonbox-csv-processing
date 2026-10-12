import { parse } from 'csv-parse/sync';
import { Either } from '../../../shared/domain/Either';
import { ValidationError } from '../../../shared/domain/errors/DomainError';

const REQUIRED_COLUMNS = ['category', 'amount', 'unit', 'date'] as const;
type Column = (typeof REQUIRED_COLUMNS)[number];

const EXPECTED_HEADER = REQUIRED_COLUMNS.join(',');
const DECIMAL_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_VALUE_LENGTH = 50;

export interface ParsedRow {
  /** Line in the original file (header = line 1). */
  line: number;
  category: string;
  amount: number;
  unit: string;
  date: Date;
}

export interface RowError {
  line: number;
  /** null when the error affects the whole row (wrong number of values). */
  column: Column | null;
  message: string;
  value: string;
}

export interface CsvParseResult {
  rows: ParsedRow[];
  errors: RowError[];
  totalRows: number;
  failedRows: number;
}

interface CsvRecord {
  record: string[];
  info: { lines: number };
}

/** Parses YYYY-MM-DD and rejects impossible dates such as 2024-02-30. */
const parseIsoDate = (value: string): Date | null => {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const isSameDay =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isSameDay ? date : null;
};

const findDuplicates = (columns: string[]): string[] =>
  [...new Set(columns.filter((column, index) => columns.indexOf(column) !== index))];

/**
 * Turns a CSV file into typed rows.
 * - File-level problems (empty, bad header, malformed syntax) -> Either.left: the upload FAILS.
 * - Row-level problems are collected with line and column: the upload still COMPLETES.
 */
export class CsvParserService {
  parse(content: Buffer): Either<ValidationError, CsvParseResult> {
    const text = content.toString('utf8');
    if (text.replace(/^﻿/, '').trim().length === 0) {
      return Either.left(new ValidationError('The file is empty'));
    }

    let records: CsvRecord[];
    try {
      records = parse(text, {
        bom: true,
        trim: true,
        skip_empty_lines: true,
        relax_column_count: true,
        info: true,
        // The library typings ignore that `info: true` wraps each record as { record, info }.
      }) as unknown as CsvRecord[];
    } catch (error) {
      // The library signals bad syntax by throwing; translate it into a business error.
      return Either.left(new ValidationError(`Malformed CSV: ${(error as Error).message}`));
    }

    const [header, ...dataRecords] = records;
    const headerOrError = this.readHeader(header.record);
    if (headerOrError.isLeft()) {
      return Either.left(headerOrError.value);
    }
    if (dataRecords.length === 0) {
      return Either.left(new ValidationError('The file has no data rows'));
    }

    const positions = headerOrError.value;
    const rows: ParsedRow[] = [];
    const errors: RowError[] = [];
    let failedRows = 0;

    for (const { record, info } of dataRecords) {
      const rowErrors: RowError[] = [];
      const row = this.readRow(record, info.lines, positions, rowErrors);
      if (row) {
        rows.push(row);
      } else {
        failedRows += 1;
        errors.push(...rowErrors);
      }
    }

    return Either.right({ rows, errors, totalRows: dataRecords.length, failedRows });
  }

  /** Validates the header and returns the position of each required column. */
  private readHeader(header: string[]): Either<ValidationError, Record<Column, number>> {
    const columns = header.map((column) => column.trim().toLowerCase());

    const duplicated = findDuplicates(columns);
    if (duplicated.length > 0) {
      return Either.left(new ValidationError(`Duplicated column(s): ${duplicated.join(', ')}`));
    }
    const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
    if (missing.length > 0) {
      return Either.left(
        new ValidationError(`Missing required column(s): ${missing.join(', ')}. Expected header: ${EXPECTED_HEADER}`),
      );
    }
    const unexpected = columns.filter((column) => !(REQUIRED_COLUMNS as readonly string[]).includes(column));
    if (unexpected.length > 0) {
      return Either.left(
        new ValidationError(`Unexpected column(s): ${unexpected.join(', ')}. Expected header: ${EXPECTED_HEADER}`),
      );
    }

    const positions = Object.fromEntries(
      REQUIRED_COLUMNS.map((column) => [column, columns.indexOf(column)]),
    ) as Record<Column, number>;
    return Either.right(positions);
  }

  /** Returns the typed row, or null after pushing every problem found into errors. */
  private readRow(
    record: string[],
    line: number,
    positions: Record<Column, number>,
    errors: RowError[],
  ): ParsedRow | null {
    if (record.length !== REQUIRED_COLUMNS.length) {
      errors.push({
        line,
        column: null,
        message: `expected ${REQUIRED_COLUMNS.length} values, found ${record.length}`,
        value: record.join(','),
      });
      return null;
    }

    const value = (column: Column): string => record[positions[column]];
    const fail = (column: Column, message: string): null => {
      errors.push({ line, column, message, value: value(column) });
      return null;
    };
    const required = (column: Column): string | null =>
      value(column).length === 0 ? fail(column, 'is required') : value(column);

    const category = required('category');

    let amount: number | null = null;
    const rawAmount = required('amount');
    if (rawAmount !== null) {
      if (!DECIMAL_PATTERN.test(rawAmount)) fail('amount', 'must be a number');
      else if (Number(rawAmount) <= 0) fail('amount', 'must be a positive number');
      else amount = Number(rawAmount);
    }

    const unit = required('unit');

    let date: Date | null = null;
    const rawDate = required('date');
    if (rawDate !== null) {
      date = parseIsoDate(rawDate);
      if (!date) fail('date', 'must be a valid date in YYYY-MM-DD format');
    }

    if (category === null || amount === null || unit === null || date === null) {
      return null;
    }
    return { line, category, amount, unit, date };
  }
}

const truncate = (value: string): string =>
  value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH - 3)}...` : value;

/**
 * Human readable report stored in Upload.errorMessage, one line per error:
 *   Row 3, column amount: must be a positive number (value: "-5")
 */
export const formatRowErrors = (errors: RowError[], maxLines = 100): string => {
  const lines = errors.slice(0, maxLines).map((error) => {
    const location = error.column ? `Row ${error.line}, column ${error.column}` : `Row ${error.line}`;
    return `${location}: ${error.message} (value: "${truncate(error.value)}")`;
  });
  if (errors.length > maxLines) {
    lines.push(`...and ${errors.length - maxLines} more errors`);
  }
  return lines.join('\n');
};

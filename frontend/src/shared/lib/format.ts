const dateTimeFormatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export const formatDateTime = (isoDate: string): string => dateTimeFormatter.format(new Date(isoDate));

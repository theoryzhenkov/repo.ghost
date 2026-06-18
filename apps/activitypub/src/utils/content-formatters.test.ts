import {describe, expect, it} from 'vitest';
import {htmlToPlainText} from './content-formatters';

describe('htmlToPlainText', () => {
    it('decodes HTML entities while preserving line breaks', () => {
        expect(htmlToPlainText('<p>A &amp; B</p><p>Next&nbsp;line</p>')).toBe('A & B\nNext\u00A0line');
    });

    it('preserves explicit br tags as newlines', () => {
        expect(htmlToPlainText('First<br>Second<br />Third')).toBe('First\nSecond\nThird');
    });
});

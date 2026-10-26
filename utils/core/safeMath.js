'use strict';

function tokenize(expression) {
    const input = String(expression ?? '').trim();

    if (input.length === 0) {
        throw new Error('Expression is empty');
    }
    if (input.length > 256) {
        throw new Error('Expression is too long');
    }

    const tokens = [];
    let index = 0;

    while (index < input.length) {
        const char = input[index];

        if (/\s/.test(char)) {
            index++;
            continue;
        }

        if (/\d/.test(char) || (char === '.' && /\d/.test(input[index + 1] || ''))) {
            const match = input.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
            if (!match) throw new Error('Invalid number');
            const value = Number(match[0]);
            if (!Number.isFinite(value)) throw new Error('Invalid number');
            tokens.push({ type: 'number', value });
            index += match[0].length;
            continue;
        }

        if (input.startsWith('**', index)) {
            tokens.push({ type: 'operator', value: '**' });
            index += 2;
            continue;
        }

        if ('+-*/%^()'.includes(char)) {
            tokens.push({
                type: char === '(' || char === ')' ? 'paren' : 'operator',
                value: char === '^' ? '**' : char
            });
            index++;
            continue;
        }

        throw new Error(`Unsupported character in expression: ${char}`);
    }

    if (tokens.length > 128) {
        throw new Error('Expression contains too many tokens');
    }

    return tokens;
}

function evaluateArithmeticExpression(expression) {
    const tokens = tokenize(expression);
    let position = 0;

    const peek = () => tokens[position];
    const consume = () => tokens[position++];

    function parseExpression() {
        let value = parseTerm();

        while (peek()?.type === 'operator' && (peek().value === '+' || peek().value === '-')) {
            const operator = consume().value;
            const right = parseTerm();
            value = operator === '+' ? value + right : value - right;
        }

        return value;
    }

    function parseTerm() {
        let value = parsePower();

        while (
            peek()?.type === 'operator' &&
            (peek().value === '*' || peek().value === '/' || peek().value === '%')
        ) {
            const operator = consume().value;
            const right = parsePower();

            if ((operator === '/' || operator === '%') && right === 0) {
                throw new Error('Division by zero is not allowed');
            }

            if (operator === '*') value *= right;
            if (operator === '/') value /= right;
            if (operator === '%') value %= right;
        }

        return value;
    }

    function parsePower() {
        let value = parseUnary();

        if (peek()?.type === 'operator' && peek().value === '**') {
            consume();
            const exponent = parsePower();
            value = value ** exponent;
        }

        return value;
    }

    function parseUnary() {
        if (peek()?.type === 'operator' && peek().value === '+') {
            consume();
            return parseUnary();
        }
        if (peek()?.type === 'operator' && peek().value === '-') {
            consume();
            return -parseUnary();
        }

        return parsePrimary();
    }

    function parsePrimary() {
        const token = consume();

        if (!token) {
            throw new Error('Unexpected end of expression');
        }

        if (token.type === 'number') {
            return token.value;
        }

        if (token.type === 'paren' && token.value === '(') {
            const value = parseExpression();
            const closing = consume();
            if (!closing || closing.type !== 'paren' || closing.value !== ')') {
                throw new Error('Missing closing parenthesis');
            }
            return value;
        }

        throw new Error('Unexpected token in expression');
    }

    const result = parseExpression();

    if (position !== tokens.length) {
        throw new Error('Unexpected token after expression');
    }
    if (!Number.isFinite(result)) {
        throw new Error('Expression result is not finite');
    }

    return result;
}

module.exports = { evaluateArithmeticExpression };

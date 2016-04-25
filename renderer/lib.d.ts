/// <reference path="../typings/main.d.ts" />
/// <reference path="../node_modules/immutable/dist/immutable.d.ts" />

declare module NodeJS {
    interface Global {
        require: NodeRequireFunction;
    }
}

type MessageKind = 'info' | 'error';
interface MessageInfo {
    text: string;
    kind: MessageKind;
}

interface String {
    includes: (sub: string) => boolean;
    startsWith: (sub: string, pos?: number) => boolean;
    endsWith: (sub: string, pos?: number) => boolean;
}

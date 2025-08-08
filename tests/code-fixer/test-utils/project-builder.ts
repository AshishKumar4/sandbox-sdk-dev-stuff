/**
 * Project Builder - Utility for creating test projects with files and issues
 */

import { CodeIssue } from '../../../src/sandbox/sandboxTypes';
import { FileOutputType } from '../../../src/schemas';

export interface TestFile {
    path: string;
    content: string;
    purpose?: string;
}

export interface TestProject {
    files: FileOutputType[];
    issues: CodeIssue[];
    name: string;
    description?: string;
}

export class ProjectBuilder {
    private files: TestFile[] = [];
    private issues: CodeIssue[] = [];
    private projectName: string = '';
    private projectDescription?: string;

    constructor(name: string = 'test-project') {
        this.projectName = name;
    }

    /**
     * Add a file to the test project
     */
    addFile(filePath: string, content: string, purpose?: string): this {
        this.files.push({
            path: filePath,
            content: content.trim(),
            purpose
        });
        return this;
    }

    /**
     * Add a TypeScript issue to the project
     */
    addIssue(ruleId: string, filePath: string, line: number, column: number, message: string): this {
        this.issues.push({
            ruleId,
            filePath,
            line,
            column,
            message,
            severity: 'error'
        });
        return this;
    }

    /**
     * Add description to the project
     */
    withDescription(description: string): this {
        this.projectDescription = description;
        return this;
    }

    /**
     * Build the complete test project
     */
    build(): TestProject {
        const fileOutputs: FileOutputType[] = this.files.map(file => ({
            file_path: file.path,
            file_contents: file.content,
            file_purpose: file.purpose || `Test file: ${file.path}`
        }));

        return {
            files: fileOutputs,
            issues: this.issues,
            name: this.projectName,
            description: this.projectDescription
        };
    }

    // ============================================================================
    // COMMON PROJECT TEMPLATES
    // ============================================================================

    /**
     * Create a React TypeScript project with common structure
     */
    static reactProject(): ProjectBuilder {
        return new ProjectBuilder('react-typescript-project')
            .addFile('src/App.tsx', `
import { useState } from 'react';
import { Button } from './components/Button';
import { Header } from './components/Header';

export default function App() {
    const [count, setCount] = useState(0);
    
    return (
        <div>
            <Header title="My App" />
            <Button onClick={() => setCount(count + 1)}>
                Count: {count}
            </Button>
        </div>
    );
}`)
            .addFile('src/main.tsx', `
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);`)
            .addFile('package.json', `
{
    "name": "test-react-app",
    "private": true,
    "dependencies": {
        "react": "^18.0.0",
        "react-dom": "^18.0.0"
    },
    "devDependencies": {
        "@types/react": "^18.0.0",
        "@types/react-dom": "^18.0.0",
        "typescript": "^5.0.0"
    }
}`);
    }

    /**
     * Create a project with import chain issues (A imports B imports C)
     */
    static importChainProject(): ProjectBuilder {
        return new ProjectBuilder('import-chain-project')
            .addFile('src/A.tsx', `
import { BComponent } from './B';
import { helperFunction } from './utils';

export function A() {
    const result = helperFunction();
    return <BComponent data={result} />;
}`)
            .addFile('src/B.tsx', `
import { CComponent } from './C';
import { formatData } from './formatters';

export function BComponent({ data }: { data: any }) {
    const formatted = formatData(data);
    return <CComponent value={formatted} />;
}`)
            .addIssue('TS2305', 'src/A.tsx', 2, 10, "Module './B' has no exported member 'BComponent'")
            .addIssue('TS2307', 'src/A.tsx', 3, 31, "Cannot find module './utils' or its corresponding type declarations")
            .addIssue('TS2305', 'src/B.tsx', 2, 10, "Module './C' has no exported member 'CComponent'")
            .addIssue('TS2307', 'src/B.tsx', 3, 26, "Cannot find module './formatters' or its corresponding type declarations");
    }

    /**
     * Create a project with path resolution issues
     */
    static pathResolutionProject(): ProjectBuilder {
        return new ProjectBuilder('path-resolution-project')
            .addFile('src/App.tsx', `
import { TestComponent } from './test';
import { UtilFunction } from '../utils/helper';
import { ConfigValue } from '@/config/settings';

export function App() {
    return (
        <div>
            <TestComponent />
            {UtilFunction()}
            {ConfigValue}
        </div>
    );
}`)
            .addFile('src/components/Button.tsx', `
import { IconComponent } from './icons/chevron';
import { useTheme } from '../hooks/theme';

export function Button() {
    const theme = useTheme();
    return (
        <button>
            <IconComponent />
            Button
        </button>
    );
}`)
            .addFile('utils/helper.ts', `
export function UtilFunction() {
    return 'Helper result';
}`)
            .addIssue('TS2305', 'src/App.tsx', 2, 10, "Module './test' has no exported member 'TestComponent'")
            .addIssue('TS2307', 'src/App.tsx', 3, 26, "Cannot find module '../utils/helper' or its corresponding type declarations")
            .addIssue('TS2307', 'src/App.tsx', 4, 26, "Cannot find module '@/config/settings' or its corresponding type declarations")
            .addIssue('TS2307', 'src/components/Button.tsx', 2, 26, "Cannot find module './icons/chevron' or its corresponding type declarations")
            .addIssue('TS2307', 'src/components/Button.tsx', 3, 20, "Cannot find module '../hooks/theme' or its corresponding type declarations");
    }

    /**
     * Create a project with import/export mismatch issues
     */
    static importExportMismatchProject(): ProjectBuilder {
        return new ProjectBuilder('import-export-mismatch-project')
            .addFile('src/main.tsx', `
import App from './App.tsx';
import { Button } from './Button';
import Utils from './utils';

export function Main() {
    return (
        <App>
            <Button />
            <Utils.helper />
        </App>
    );
}`)
            .addFile('src/App.tsx', `
// This exports a named export, not default
export function App({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
}`)
            .addFile('src/Button.tsx', `
// This exports a default export, not named
export default function Button() {
    return <button>Click me</button>;
}`)
            .addFile('src/utils.ts', `
// This exports named exports, not default
export const helper = () => 'help';
export const format = (str: string) => str.toUpperCase();`)
            .addIssue('TS2614', 'src/main.tsx', 2, 8, "Module './App.tsx' has no exported member 'App'. Did you mean to use 'import App from \"./App.tsx\"' instead?")
            .addIssue('TS2613', 'src/main.tsx', 3, 10, "Module './Button' has no default export. Did you mean to use 'import { Button } from \"./Button\"' instead?")
            .addIssue('TS2614', 'src/main.tsx', 4, 8, "Module './utils' has no exported member 'Utils'. Did you mean to use 'import Utils from \"./utils\"' instead?");
    }
}
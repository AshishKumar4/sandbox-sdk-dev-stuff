/**
 * Mock File Fetcher - Simulates file fetching for testing
 */

import { FileFetcher } from '../../../src/code-fixer/types';

export interface MockFileSystem {
    [filePath: string]: string | null; // null represents file not found
}

export interface MockFetcherOptions {
    simulateDelay?: number;
    simulateErrors?: string[]; // File paths that should throw errors
    simulateNotFound?: string[]; // File paths that should return null
    logFetches?: boolean;
}

/**
 * Create a mock file fetcher for testing
 */
export function createMockFileFetcher(
    mockFileSystem: MockFileSystem,
    options: MockFetcherOptions = {}
): { fetcher: FileFetcher; fetchLog: string[] } {
    const fetchLog: string[] = [];
    
    const fetcher: FileFetcher = async (filePath: string): Promise<string | null> => {
        if (options.logFetches) {
            fetchLog.push(filePath);
        }
        
        // Simulate network delay
        if (options.simulateDelay) {
            await new Promise(resolve => setTimeout(resolve, options.simulateDelay));
        }
        
        // Simulate errors for specific files
        if (options.simulateErrors?.includes(filePath)) {
            throw new Error(`Failed to fetch file: ${filePath}`);
        }
        
        // Simulate file not found
        if (options.simulateNotFound?.includes(filePath)) {
            return null;
        }
        
        // Return file content from mock file system
        return mockFileSystem[filePath] ?? null;
    };
    
    return { fetcher, fetchLog };
}

// ============================================================================
// COMMON MOCK FILE SYSTEMS
// ============================================================================

/**
 * React TypeScript project mock file system
 */
export const mockReactProject: MockFileSystem = {
    'src/App.tsx': `
import React, { useState } from 'react';
import { Button } from './components/Button';
import { Header } from './components/Header';

export default function App() {
    const [count, setCount] = useState(0);
    
    return (
        <div>
            <Header title="Test App" />
            <Button onClick={() => setCount(count + 1)}>
                Count: {count}
            </Button>
        </div>
    );
}`,

    'src/components/Button.tsx': `
import React from 'react';

interface ButtonProps {
    children: React.ReactNode;
    onClick?: () => void;
}

export function Button({ children, onClick }: ButtonProps) {
    return (
        <button onClick={onClick}>
            {children}
        </button>
    );
}`,

    'src/components/Header.tsx': `
import React from 'react';

interface HeaderProps {
    title: string;
}

export function Header({ title }: HeaderProps) {
    return <h1>{title}</h1>;
}`,

    'src/utils/helpers.ts': `
export function formatNumber(num: number): string {
    return num.toLocaleString();
}

export function capitalizeString(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}`,

    'src/hooks/useCounter.ts': `
import { useState } from 'react';

export function useCounter(initialValue: number = 0) {
    const [count, setCount] = useState(initialValue);
    
    const increment = () => setCount(c => c + 1);
    const decrement = () => setCount(c => c - 1);
    const reset = () => setCount(initialValue);
    
    return { count, increment, decrement, reset };
}`
};

/**
 * Mock file system for testing missing files
 */
export const mockMissingFilesProject: MockFileSystem = {
    'src/App.tsx': `
import React from 'react';
import { MissingComponent } from './missing/Component';
import { NonExistentHelper } from './helpers/nonexistent';

export default function App() {
    return (
        <div>
            <MissingComponent />
            <span>{NonExistentHelper()}</span>
        </div>
    );
}`
    // Note: missing/Component.tsx and helpers/nonexistent.ts are intentionally missing
};

/**
 * Mock file system for testing import/export mismatches
 */
export const mockImportExportMismatchProject: MockFileSystem = {
    'src/main.tsx': `
import App from './App'; // Should be named import
import { Button } from './Button'; // Should be default import
import Utils from './utils'; // Should be named imports

export function Main() {
    return (
        <App>
            <Button />
            <div>{Utils.format('test')}</div>
        </App>
    );
}`,

    'src/App.tsx': `
import React from 'react';

// Exports named export, not default
export function App({ children }: { children: React.ReactNode }) {
    return <div className="app">{children}</div>;
}`,

    'src/Button.tsx': `
import React from 'react';

// Exports default, not named
export default function Button() {
    return <button>Click me</button>;
}`,

    'src/utils.ts': `
// Exports named exports, not default
export function format(str: string): string {
    return str.toUpperCase();
}

export function parse(str: string): string[] {
    return str.split(' ');
}`
};

/**
 * Mock file system for testing path resolution
 */
export const mockPathResolutionProject: MockFileSystem = {
    'src/App.tsx': `
import { TestComponent } from './test'; // Should resolve to src/test.tsx
import { UtilFunction } from '../utils/helper'; // Should resolve to utils/helper.ts  
import { ConfigValue } from '@/config/settings'; // Should resolve to src/config/settings.ts

export function App() {
    return (
        <div>
            <TestComponent />
            <span>{UtilFunction()}</span>
            <span>{ConfigValue}</span>
        </div>
    );
}`,

    'src/test.tsx': `
import React from 'react';

export function TestComponent() {
    return <div>Test Component</div>;
}

// Missing: TestComponent export (will be added by fixer)
`,

    'utils/helper.ts': `
export function UtilFunction(): string {
    return 'Utility function result';
}`,

    'src/config/settings.ts': `
export const ConfigValue = 'configuration-value';
`
};

/**
 * Mock file system for performance testing (large project)
 */
export function createMockLargeProject(fileCount: number = 100): MockFileSystem {
    const mockSystem: MockFileSystem = {};
    
    // Main app file
    mockSystem['src/App.tsx'] = `
import React from 'react';
${Array.from({length: Math.min(fileCount, 50)}, (_, i) => 
    `import { Component${i} } from './components/Component${i}';`
).join('\n')}

export default function App() {
    return (
        <div>
            ${Array.from({length: Math.min(fileCount, 50)}, (_, i) => 
                `<Component${i} key={${i}} />`
            ).join('\n            ')}
        </div>
    );
}`;
    
    // Generate component files
    for (let i = 0; i < Math.min(fileCount - 1, 99); i++) {
        mockSystem[`src/components/Component${i}.tsx`] = `
import React from 'react';

export function Component${i}() {
    return (
        <div>
            <h2>Component {${i}}</h2>
            <p>This is component number ${i}</p>
        </div>
    );
}`;
        
        // Some helper files
        if (i % 3 === 0) {
            mockSystem[`src/helpers/helper${i}.ts`] = `
export function helperFunction${i}(): string {
    return 'Result from helper ${i}';
}`;
        }
    }
    
    return mockSystem;
}

// ============================================================================
// MOCK FETCHER FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a mock fetcher that simulates slow network
 */
export function createSlowMockFetcher(fileSystem: MockFileSystem, delayMs: number = 100) {
    return createMockFileFetcher(fileSystem, {
        simulateDelay: delayMs,
        logFetches: true
    });
}

/**
 * Create a mock fetcher that simulates file not found errors
 */
export function createUnreliableMockFetcher(
    fileSystem: MockFileSystem,
    errorFiles: string[] = [],
    notFoundFiles: string[] = []
) {
    return createMockFileFetcher(fileSystem, {
        simulateErrors: errorFiles,
        simulateNotFound: notFoundFiles,
        logFetches: true
    });
}

/**
 * Create a mock fetcher for specific test scenarios
 */
export function createScenarioMockFetcher(scenario: 'react' | 'missing-files' | 'import-mismatch' | 'path-resolution') {
    const fileSystems = {
        'react': mockReactProject,
        'missing-files': mockMissingFilesProject,
        'import-mismatch': mockImportExportMismatchProject,
        'path-resolution': mockPathResolutionProject
    };
    
    return createMockFileFetcher(fileSystems[scenario], { logFetches: true });
}
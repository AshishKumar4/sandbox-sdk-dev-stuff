/**
 * Realistic E2E Scenarios - Real-world project testing
 * Tests complete workflows with realistic React TypeScript projects
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { fixProjectIssues } from '../../../src/code-fixer/index';
import { FileOutputType } from '../../../src/schemas';
import { CodeIssue } from '../../../src/sandbox/sandboxTypes';
import { createMockFileFetcher } from '../mocks/file-fetcher.mock';
import { setupFixerAssertions } from '../test-utils/assertion-helpers';

beforeAll(() => {
    setupFixerAssertions();
});

describe('Realistic E2E Scenarios', () => {
    
    describe('The Critical Path Resolution Bug - Real Scenario', () => {
        test('should fix the exact scenario that was failing: ./test from src/App.tsx', async () => {
            // This is the exact scenario from the user's bug report
            const files: FileOutputType[] = [
                {
                    file_path: 'src/App.tsx',
                    file_contents: `import { useState, useEffect } from 'react';
import { Sparkles, ThisWorks } from './test';
import { Button } from '@/components/ui/button';

export default function App() {
  const [isDark, setIsDark] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4 overflow-hidden relative">
      <Button
        onClick={toggleTheme}
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 text-2xl hover:scale-110 hover:rotate-12 transition-all duration-200 active:scale-90 z-50">

        {isDark ? '☀️' : '🌙'}
      </Button>

      <div className="absolute inset-0 bg-gradient-rainbow opacity-10 dark:opacity-20" />
      
      <div className="text-center space-y-8 relative z-10 animate-fade-in">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-primary floating">
            <Sparkles className="w-8 h-8 text-white rotating" />
          </div>
        </div>

        <h1 className="text-5xl md:text-7xl font-display font-bold text-balance leading-tight">
          Creating your <span className="text-gradient">app</span>
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto text-pretty">
          Your application would be ready soon.
        </p>

        <div className="flex justify-center">
          <Button
            size="lg"
            className="btn-gradient px-8 py-4 text-lg font-semibold hover:-translate-y-0.5 transition-all duration-200">

            Please wait
          </Button>
        </div>
      </div>

      <footer className="absolute bottom-8 text-center text-muted-foreground/80">
        <p>Powered by Cloudflare<ThisWorks /></p>
      </footer>
    </main>);

}`,
                    file_purpose: 'Main app component'
                },
                {
                    file_path: 'src/main.tsx',
                    file_contents: `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import {
  createBrowserRouter,
  RouterProvider } from
"react-router-dom";
import { ErrorBoundary } from './components/ErrorBoundary';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';

const router = createBrowserRouter([
{
  path: "/",
  element: <App />,
  errorElement: <RouteErrorBoundary />
}]
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>
);`,
                    file_purpose: 'Main entry point'
                }
            ];
            
            const issues: CodeIssue[] = [
                {
                    ruleId: 'TS2305',
                    filePath: 'src/App.tsx',
                    line: 2,
                    column: 20,
                    message: "Module '\"./test\"' has no exported member 'ThisWorks'.",
                    severity: 'error'
                }
            ];
            
            // Mock the existing src/test.tsx file (was created in previous runs)
            const { fetcher } = createMockFileFetcher({
                'src/test.tsx': `// This is a **STUB** file, please properly implement it or fix its usage

import React from "react";

export const Sparkles = ({ className }: {className?: string;}): React.ReactElement => {
    return <div>Placeholder Sparkles component</div>;
};`
            });
            
            const result = await fixProjectIssues(files, issues, fetcher);
            
            // THIS IS THE CRITICAL TEST - this was failing before the fix
            expect(result).toHaveFixedIssue('TS2305', 'src/App.tsx');
            expect(result).toHaveModifiedFile('src/test.tsx', ['ThisWorks']);
            expect(result).toHaveNoErrors();
            
            // Verify the export was added correctly
            const modifiedTestFile = result.modifiedFiles.find(f => f.file_path === 'src/test.tsx');
            expect(modifiedTestFile).toBeDefined();
            expect(modifiedTestFile!.file_contents).toContain('export const ThisWorks');
            expect(modifiedTestFile!.file_contents).toContain('Sparkles'); // Existing export preserved
            expect(modifiedTestFile!.file_contents).toContain('STUB'); // Has stub comment
        });
        
        test('should handle the complete multi-issue scenario from the bug report', async () => {
            // This represents the full scenario from the user's logs
            const files: FileOutputType[] = [
                {
                    file_path: 'src/App.tsx',
                    file_contents: `import { useState, useEffect } from 'react';
import { Sparkles, ThisWorks } from './test';
import { Button } from '@/components/ui/button';

export default function App() {
    return (
        <div>
            <Button onClick={() => alert('clicked')}>
                <Sparkles />
                <ThisWorks />
            </Button>
        </div>
    );
}`,
                    file_purpose: 'Main app'
                },
                {
                    file_path: 'src/main.tsx',
                    file_contents: `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);`,
                    file_purpose: 'Main entry'
                }
            ];
            
            const issues: CodeIssue[] = [
                {
                    ruleId: 'TS2613',
                    filePath: 'src/App.tsx',
                    line: 3,
                    column: 8,
                    message: 'Module \'"@/components/ui/button"\' has no default export. Did you mean to use \'import { Button } from "@/components/ui/button"\' instead?',
                    severity: 'error'
                },
                {
                    ruleId: 'TS2614',
                    filePath: 'src/main.tsx',
                    line: 4,
                    column: 10,
                    message: 'Module \'"./App.tsx"\' has no exported member \'App\'. Did you mean to use \'import App from "./App.tsx"\' instead?',
                    severity: 'error'
                },
                {
                    ruleId: 'TS2305',
                    filePath: 'src/App.tsx',
                    line: 2,
                    column: 20,
                    message: 'Module \'"./test"\' has no exported member \'ThisWorks\'.',
                    severity: 'error'
                }
            ];
            
            const { fetcher } = createMockFileFetcher({
                'src/test.tsx': `
import React from "react";

export const Sparkles = ({ className }: {className?: string;}): React.ReactElement => {
    return <div>✨ Sparkles</div>;
};`,
                'src/components/ui/button.tsx': `
import React from 'react';

export function Button({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
    return <button onClick={onClick}>{children}</button>;
}`
            });
            
            const result = await fixProjectIssues(files, issues, fetcher);
            
            // Should fix all issues
            expect(result.fixedIssues.length).toBe(3);
            expect(result.unfixableIssues.length).toBe(0);
            
            // Check specific fixes
            expect(result).toHaveFixedIssue('TS2305', 'src/App.tsx'); // Added ThisWorks export
            expect(result).toHaveFixedIssue('TS2613', 'src/App.tsx'); // Fixed Button import
            expect(result).toHaveFixedIssue('TS2614', 'src/main.tsx'); // Fixed App import
            
            // Check file modifications
            expect(result).toHaveModifiedFile('src/test.tsx', ['ThisWorks']);
            expect(result).toHaveModifiedFile('src/App.tsx', ['{ Button }']);
            expect(result).toHaveModifiedFile('src/main.tsx', ['import App from']);
        });
    });
    
    describe('Real React Project Scenarios', () => {
        test('should handle typical React component refactoring scenario', async () => {
            const files: FileOutputType[] = [
                {
                    file_path: 'src/App.tsx',
                    file_contents: `import React from 'react';
import { Header } from './components/Header';
import { UserProfile } from './components/UserProfile';
import { TodoList } from './components/TodoList';
import { Footer } from './components/Footer';

export default function App() {
    return (
        <div className="app">
            <Header />
            <main>
                <UserProfile />
                <TodoList />
            </main>
            <Footer />
        </div>
    );
}`,
                    file_purpose: 'Main app'
                },
                {
                    file_path: 'src/components/Header.tsx',
                    file_contents: `import React from 'react';
import { Logo } from './Logo';
import { Navigation } from './Navigation';

export function Header() {
    return (
        <header>
            <Logo />
            <Navigation />
        </header>
    );
}`,
                    file_purpose: 'Header component'
                }
            ];
            
            const issues: CodeIssue[] = [
                {
                    ruleId: 'TS2307',
                    filePath: 'src/components/Header.tsx',
                    line: 2,
                    column: 20,
                    message: "Cannot find module './Logo' or its corresponding type declarations.",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2307',
                    filePath: 'src/components/Header.tsx',
                    line: 3,
                    column: 26,
                    message: "Cannot find module './Navigation' or its corresponding type declarations.",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2307',
                    filePath: 'src/App.tsx',
                    line: 3,
                    column: 26,
                    message: "Cannot find module './components/UserProfile' or its corresponding type declarations.",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2307',
                    filePath: 'src/App.tsx',
                    line: 4,
                    column: 22,
                    message: "Cannot find module './components/TodoList' or its corresponding type declarations.",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2307',
                    filePath: 'src/App.tsx',
                    line: 5,
                    column: 20,
                    message: "Cannot find module './components/Footer' or its corresponding type declarations.",
                    severity: 'error'
                }
            ];
            
            const result = await fixProjectIssues(files, issues);
            
            // Should create all missing component files
            expect(result.fixedIssues.length).toBe(5);
            expect(result.unfixableIssues.length).toBe(0);
            
            // Check that stub files were created with proper React components
            const createdFiles = result.modifiedFiles.map(f => f.file_path).sort();
            expect(createdFiles).toEqual([
                'src/components/Footer.tsx',
                'src/components/Logo.tsx',
                'src/components/Navigation.tsx',
                'src/components/TodoList.tsx',
                'src/components/UserProfile.tsx'
            ]);
            
            // Each file should contain a proper React component
            result.modifiedFiles.forEach(file => {
                expect(file.file_contents).toContain('React.ReactElement');
                expect(file.file_contents).toContain('export const');
                expect(file.file_contents).toContain('<div>');
            });
        });
        
        test('should handle complex import/export refactoring in TypeScript project', async () => {
            const files: FileOutputType[] = [
                {
                    file_path: 'src/utils/api.ts',
                    file_contents: `import { httpClient } from './http';
import { AuthService } from './auth';
import config from './config';

export class ApiService {
    private http = httpClient;
    private auth = AuthService;
    
    async getData() {
        const token = await this.auth.getToken();
        return this.http.get('/data', {
            headers: { Authorization: \`Bearer \${token}\` },
            baseUrl: config.apiUrl
        });
    }
}`,
                    file_purpose: 'API service'
                }
            ];
            
            const issues: CodeIssue[] = [
                {
                    ruleId: 'TS2305',
                    filePath: 'src/utils/api.ts',
                    line: 1,
                    column: 10,
                    message: "Module './http' has no exported member 'httpClient'.",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2613',
                    filePath: 'src/utils/api.ts',
                    line: 2,
                    column: 10,
                    message: "Module './auth' has no default export. Did you mean to use 'import { AuthService } from \"./auth\"' instead?",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2614',
                    filePath: 'src/utils/api.ts',
                    line: 3,
                    column: 8,
                    message: "Module './config' has no exported member 'config'. Did you mean to use 'import config from \"./config\"' instead?",
                    severity: 'error'
                }
            ];
            
            const { fetcher } = createMockFileFetcher({
                'src/utils/http.ts': `
// Named exports, not default
export const httpClient = {
    get: async (url: string, options?: any) => ({ data: 'mock' })
};`,
                'src/utils/auth.ts': `
// Named export, not default  
export class AuthService {
    async getToken(): Promise<string> {
        return 'mock-token';
    }
}`,
                'src/utils/config.ts': `
// Default export, not named
const config = {
    apiUrl: 'https://api.example.com'
};

export default config;`
            });
            
            const result = await fixProjectIssues(files, issues, fetcher);
            
            // Should fix all import/export mismatches
            expect(result.fixedIssues.length).toBe(2); // http exports httpClient, config is already correct as default
            expect(result.unfixableIssues.length).toBe(0); // auth should be converted from default to named
            
            const modifiedApiFile = result.modifiedFiles.find(f => f.file_path === 'src/utils/api.ts');
            expect(modifiedApiFile).toBeDefined();
            
            const content = modifiedApiFile!.file_contents;
            expect(content).toContain('import { AuthService }'); // Fixed to named import
            expect(content).toContain('import config from'); // Correct default import preserved
        });
    });
    
    describe('Complex Dependency Chains', () => {
        test('should handle deep import chains with mixed issues', async () => {
            const files: FileOutputType[] = [
                {
                    file_path: 'src/pages/Dashboard.tsx',
                    file_contents: `import React from 'react';
import { UserWidget } from '../components/UserWidget';
import { StatsWidget } from '../components/StatsWidget';
import { RecentActivity } from '../components/RecentActivity';

export default function Dashboard() {
    return (
        <div className="dashboard">
            <h1>Dashboard</h1>
            <div className="widgets">
                <UserWidget />
                <StatsWidget />
                <RecentActivity />
            </div>
        </div>
    );
}`,
                    file_purpose: 'Dashboard page'
                },
                {
                    file_path: 'src/components/UserWidget.tsx',
                    file_contents: `import React from 'react';
import { useUser } from '../hooks/useUser';
import { formatUser } from '../utils/userUtils';
import { Avatar } from './Avatar';

export function UserWidget() {
    const user = useUser();
    const displayName = formatUser(user);
    
    return (
        <div className="user-widget">
            <Avatar user={user} />
            <span>{displayName}</span>
        </div>
    );
}`,
                    file_purpose: 'User widget'
                },
                {
                    file_path: 'src/components/StatsWidget.tsx',
                    file_contents: `import React from 'react';
import { useStats } from '../hooks/useStats';
import { Chart } from './Chart';
import { MetricCard } from './MetricCard';

export function StatsWidget() {
    const stats = useStats();
    
    return (
        <div className="stats-widget">
            <h2>Statistics</h2>
            <div className="metrics">
                {stats.map(stat => (
                    <MetricCard key={stat.id} metric={stat} />
                ))}
            </div>
            <Chart data={stats} />
        </div>
    );
}`,
                    file_purpose: 'Stats widget'
                }
            ];
            
            const issues: CodeIssue[] = [
                // Missing modules
                {
                    ruleId: 'TS2307',
                    filePath: 'src/components/UserWidget.tsx',
                    line: 2,
                    column: 20,
                    message: "Cannot find module '../hooks/useUser' or its corresponding type declarations.",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2307',
                    filePath: 'src/components/UserWidget.tsx',
                    line: 3,
                    column: 26,
                    message: "Cannot find module '../utils/userUtils' or its corresponding type declarations.",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2307',
                    filePath: 'src/components/UserWidget.tsx',
                    line: 4,
                    column: 20,
                    message: "Cannot find module './Avatar' or its corresponding type declarations.",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2307',
                    filePath: 'src/components/StatsWidget.tsx',
                    line: 2,
                    column: 21,
                    message: "Cannot find module '../hooks/useStats' or its corresponding type declarations.",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2307',
                    filePath: 'src/components/StatsWidget.tsx',
                    line: 3,
                    column: 19,
                    message: "Cannot find module './Chart' or its corresponding type declarations.",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2307',
                    filePath: 'src/components/StatsWidget.tsx',
                    line: 4,
                    column: 24,
                    message: "Cannot find module './MetricCard' or its corresponding type declarations.",
                    severity: 'error'
                },
                // Missing exports
                {
                    ruleId: 'TS2305',
                    filePath: 'src/pages/Dashboard.tsx',
                    line: 3,
                    column: 10,
                    message: "Module '../components/StatsWidget' has no exported member 'StatsWidget'.",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2305',
                    filePath: 'src/pages/Dashboard.tsx',
                    line: 4,
                    column: 10,
                    message: "Module '../components/RecentActivity' has no exported member 'RecentActivity'.",
                    severity: 'error'
                }
            ];
            
            const result = await fixProjectIssues(files, issues);
            
            // Should handle all issues (create files and add exports)
            expect(result.fixedIssues.length).toBe(8);
            expect(result.unfixableIssues.length).toBe(0);
            
            // Should create missing files
            const createdPaths = result.modifiedFiles.map(f => f.file_path).sort();
            expect(createdPaths).toContain('src/hooks/useUser.tsx');
            expect(createdPaths).toContain('src/hooks/useStats.tsx');
            expect(createdPaths).toContain('src/utils/userUtils.tsx');
            expect(createdPaths).toContain('src/components/Avatar.tsx');
            expect(createdPaths).toContain('src/components/Chart.tsx');
            expect(createdPaths).toContain('src/components/MetricCard.tsx');
            expect(createdPaths).toContain('src/components/RecentActivity.tsx');
            
            // Should add missing exports to existing files
            const modifiedStatsWidget = result.modifiedFiles.find(f => f.file_path === 'src/components/StatsWidget.tsx');
            expect(modifiedStatsWidget?.file_contents).toContain('export const StatsWidget');
        });
    });
    
    describe('Edge Cases from Real Development', () => {
        test('should handle mixed relative and absolute imports', async () => {
            const files: FileOutputType[] = [
                {
                    file_path: 'src/components/complex/Form.tsx',
                    file_contents: `import React from 'react';
import { validateForm } from '../../utils/validation';
import { FormField } from '../ui/FormField';
import { Button } from '@/components/ui/Button';
import { useFormState } from '@/hooks/useFormState';

export function Form() {
    const { values, errors, handleChange } = useFormState();
    
    return (
        <form>
            <FormField 
                value={values.email} 
                onChange={handleChange}
                error={errors.email}
            />
            <Button type="submit">
                Submit
            </Button>
        </form>
    );
}`,
                    file_purpose: 'Complex form component'
                }
            ];
            
            const issues: CodeIssue[] = [
                {
                    ruleId: 'TS2307',
                    filePath: 'src/components/complex/Form.tsx',
                    line: 2,
                    column: 26,
                    message: "Cannot find module '../../utils/validation' or its corresponding type declarations.",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2307',
                    filePath: 'src/components/complex/Form.tsx',
                    line: 3,
                    column: 23,
                    message: "Cannot find module '../ui/FormField' or its corresponding type declarations.",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2307',
                    filePath: 'src/components/complex/Form.tsx',
                    line: 4,
                    column: 20,
                    message: "Cannot find module '@/components/ui/Button' or its corresponding type declarations.",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2307',
                    filePath: 'src/components/complex/Form.tsx',
                    line: 5,
                    column: 26,
                    message: "Cannot find module '@/hooks/useFormState' or its corresponding type declarations.",
                    severity: 'error'
                }
            ];
            
            const result = await fixProjectIssues(files, issues);
            
            // Should create all missing files with correct paths
            expect(result.fixedIssues.length).toBe(4);
            expect(result.unfixableIssues.length).toBe(0);
            
            const createdPaths = result.modifiedFiles.map(f => f.file_path).sort();
            expect(createdPaths).toEqual([
                'src/components/ui/Button.tsx',
                'src/components/ui/FormField.tsx', 
                'src/hooks/useFormState.tsx',
                'src/utils/validation.tsx'
            ]);
            
            // Should create appropriate stubs based on usage
            const validationFile = result.modifiedFiles.find(f => f.file_path === 'src/utils/validation.tsx');
            expect(validationFile?.file_contents).toContain('validateForm');
            expect(validationFile?.file_contents).toContain('function');
            
            const formStateFile = result.modifiedFiles.find(f => f.file_path === 'src/hooks/useFormState.tsx');
            expect(formStateFile?.file_contents).toContain('useFormState');
            expect(formStateFile?.file_contents).toContain('values');
            expect(formStateFile?.file_contents).toContain('errors');
            expect(formStateFile?.file_contents).toContain('handleChange');
        });
    });
});
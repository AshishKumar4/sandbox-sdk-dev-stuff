import z from 'zod';

export const FileOutputSchema = z.object({
    file_path: z.string().describe('The name of the file including path'),
    file_contents: z.string().describe('The complete contents of the file'),
    file_purpose: z.string().describe('Concise purpose of the file and it\'s expected contents')
});

export type FileOutputType = z.infer<typeof FileOutputSchema>
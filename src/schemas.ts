import z from 'zod';

export const FileOutputSchema = z.object({
    filePath: z.string().describe('The name of the file including path'),
    fileContents: z.string().describe('The complete contents of the file'),
    filePurpose: z.string().describe('Concise purpose of the file and it\'s expected contents')
});

export type FileOutputType = z.infer<typeof FileOutputSchema>
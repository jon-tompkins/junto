import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Dispatch',
  description: 'Create your own AI-powered dispatch on MyJunto. Pick Twitter sources, define your synthesis prompt, and start building an audience.',
};

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}

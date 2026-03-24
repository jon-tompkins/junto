import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Newsletter',
  description: 'Create your own AI-powered newsletter on MyJunto. Pick Twitter sources, define your synthesis prompt, and start building an audience.',
};

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}

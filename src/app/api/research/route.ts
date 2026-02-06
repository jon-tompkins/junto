import { NextResponse } from 'next/server';

const GITHUB_RAW = 'https://raw.githubusercontent.com/jon-tompkins/Agent-Reports/main/reports';

export async function GET() {
  try {
    // Fetch index from GitHub
    const res = await fetch(`${GITHUB_RAW}/index.json`, {
      next: { revalidate: 300 } // Cache for 5 minutes
    });
    
    if (!res.ok) {
      throw new Error('Failed to fetch reports index');
    }
    
    const data = await res.json();
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reports' },
      { status: 500 }
    );
  }
}

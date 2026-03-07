import { NextResponse } from 'next/server';

const GITHUB_RAW = 'https://raw.githubusercontent.com/jon-tompkins/Agent-Reports/main/reports';

export async function GET() {
  try {
    // Add timestamp to bust GitHub CDN cache
    const cacheBuster = Date.now();
    const res = await fetch(`${GITHUB_RAW}/index.json?t=${cacheBuster}`, {
      cache: 'no-store'
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

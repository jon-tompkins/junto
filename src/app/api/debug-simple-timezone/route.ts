import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Simulate the exact scenario: 6:04 PM PT conversion
    const userTimeStr = "18:04:00"; // 6:04 PM
    const timezone = "America/Los_Angeles";
    
    console.log('=== DEBUGGING 6:04 PM PT CONVERSION ===');
    
    // Current UTC time
    const currentUtc = new Date();
    console.log('Current UTC:', currentUtc.toISOString());
    
    // Calculate 5-minute windows for the last few cycles
    const windows = [];
    for (let i = -2; i <= 2; i++) {
      const baseTime = new Date(currentUtc.getTime() + i * 5 * 60 * 1000);
      const windowStart = new Date(baseTime);
      windowStart.setMinutes(Math.floor(windowStart.getMinutes() / 5) * 5, 0, 0);
      const windowEnd = new Date(windowStart.getTime() + 5 * 60 * 1000);
      
      windows.push({
        cycle: i,
        start: windowStart.toISOString(),
        end: windowEnd.toISOString()
      });
    }
    
    // PT offset
    const timezoneOffset = -8 * 60; // PT is UTC-8
    
    // Generate candidates for multiple days
    const candidates = [];
    const today = new Date();
    
    for (let dayOffset = -1; dayOffset <= 1; dayOffset++) {
      const targetDate = new Date(today.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const dateStr = targetDate.toISOString().split('T')[0];
      
      const userDateTime = `${dateStr}T${userTimeStr}`;
      const userLocalTime = new Date(userDateTime);
      const userUtcTime = new Date(userLocalTime.getTime() - timezoneOffset * 60000);
      
      candidates.push({
        day: dayOffset === -1 ? 'yesterday' : dayOffset === 0 ? 'today' : 'tomorrow',
        localDateTime: userDateTime,
        utcDateTime: userUtcTime.toISOString()
      });
    }
    
    // Check which candidates fall in which windows
    const matches = [];
    for (const candidate of candidates) {
      const candidateTime = new Date(candidate.utcDateTime);
      
      for (const window of windows) {
        const windowStart = new Date(window.start);
        const windowEnd = new Date(window.end);
        
        if (candidateTime >= windowStart && candidateTime <= windowEnd) {
          matches.push({
            candidate: candidate.day,
            candidateTime: candidate.utcDateTime,
            window: `Cycle ${window.cycle}: ${window.start} - ${window.end}`,
            match: true
          });
        }
      }
    }
    
    return NextResponse.json({
      debug: {
        userInput: "6:04 PM PT",
        currentUtc: currentUtc.toISOString(),
        timezoneOffset: timezoneOffset,
        windows: windows,
        candidates: candidates,
        matches: matches,
        analysis: {
          expectedMatch: "6:04 PM PT = 2:04 AM UTC next day",
          shouldTriggerIn: "2:00-2:05 AM UTC window",
          currentWindow: windows.find(w => w.cycle === 0)
        }
      }
    });
    
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
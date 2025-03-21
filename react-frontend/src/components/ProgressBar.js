import React from 'react';
import './ProgressBar.css';

const ProgressBar = ({ timestamps = [], currentTime = 0, duration = 0, progress = 0 }) => {
  console.log("ProgressBar received props:", { timestamps, currentTime, duration, progress });
  
  const formatTime = (seconds) => {
    if (typeof seconds !== 'number' || isNaN(seconds)) {
      console.log("Invalid seconds value:", seconds);
      return "0:00";
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const timestampToSeconds = (timestamp) => {
    const parts = timestamp.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  };

  const handleTimestampClick = (timestamp) => {
    const seconds = timestampToSeconds(timestamp);
    console.log("Seeking to timestamp:", timestamp, "seconds:", seconds);
    
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "seekTo",
          time: seconds
        });
      });
    }
  };

  const hasVideo = duration > 0;

  return (
    <div className="progress-container">
      <div className="progress-wrapper">
        <div className="url-container">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          {timestamps.map((timestamp, index) => {
            const seconds = timestampToSeconds(timestamp);
            const position = (seconds / duration) * 100;
            
            return (
              <div
                key={`${timestamp}-${index}`}
                className="timestamp-marker"
                style={{ left: `${position}%` }}
                onClick={() => handleTimestampClick(timestamp)}
                title={timestamp}
              >
                <div className="timestamp-tooltip">{timestamp}</div>
              </div>
            );
          })}
        </div>
        {hasVideo && (
          <div 
            className="time-display" 
            style={{ 
              left: `${progress}%`,
              opacity: hasVideo ? 1 : 0
            }}
          >
            {formatTime(currentTime)}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProgressBar;
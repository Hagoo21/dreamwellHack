import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ProgressBar from './components/ProgressBar';
import PromptBar from './components/PromptBar';
import ResultsArea from './components/ResultsArea';
import './App.css';

function App() {
  const [results, setResults] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamingText, setCurrentStreamingText] = useState('');
  const [timestamps, setTimestamps] = useState([]);
  const [currentVideoId, setCurrentVideoId] = useState(null);
  const [isProcessingTranscript, setIsProcessingTranscript] = useState(false);
  const [processedVideos, setProcessedVideos] = useState(new Set());
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [progress, setProgress] = useState(0);

  const extractTimestamps = (text) => {
    console.log("Extracting timestamps from:", text);
    const timestamps = new Set();
    
    const standardRegex = /\b(\d{1,2}:)?(\d{1,2}):(\d{2})\b/g;
    const standardMatches = text.match(standardRegex) || [];
    console.log("Standard matches:", standardMatches);
    standardMatches.forEach(match => timestamps.add(match));

    const bracketRegex = /\[(\d{1,2}):(\d{2}):(\d{2})\.?\d*\]/g;
    const bracketMatches = Array.from(text.matchAll(bracketRegex));
    console.log("Bracket matches:", bracketMatches);
    
    for (const match of bracketMatches) {
      const [, hours, minutes, seconds] = match;
      const formattedHours = hours.padStart(2, '0');
      const formattedMinutes = minutes.padStart(2, '0');
      const formattedSeconds = seconds.padStart(2, '0');
      
      const formattedTime = formattedHours === '00' ? 
        `${parseInt(formattedMinutes)}:${formattedSeconds}` : 
        `${parseInt(formattedHours)}:${formattedMinutes}:${formattedSeconds}`;
      
      timestamps.add(formattedTime);
    }

    const result = Array.from(timestamps);
    console.log("Extracted timestamps:", result);
    return result;
  };

  useEffect(() => {
    let messageListener;
    let progressInterval;
    
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      messageListener = (message, sender, sendResponse) => {
        if (message.action === "videoUpdate" && message.data.videoId) {
          const newVideoId = message.data.videoId;
          if (newVideoId !== currentVideoId) {
            setCurrentVideoId(newVideoId);
          }
        }
      };
      
      chrome.runtime.onMessage.addListener(messageListener);

      // Set up interval to track video progress
      progressInterval = setInterval(() => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs[0] && tabs[0].url.includes('youtube.com/watch')) {
            chrome.tabs.sendMessage(tabs[0].id, {action: "getVideoTime"}, response => {
              if (response) {
                console.log("Received video time response:", response);
                // Ensure we're working with numbers
                const currentTime = parseFloat(response.currentTime) || 0;
                const progress = parseFloat(response.progress) || 0;
                const duration = parseFloat(response.duration) || 0;
                
                setCurrentTime(currentTime);
                setProgress(progress);
                setVideoDuration(duration);
              }
            });
          }
        });
      }, 1000); // Update every second
    }

    return () => {
      if (messageListener) {
        chrome.runtime.onMessage.removeListener(messageListener);
      }
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    };
  }, [currentVideoId]);

  useEffect(() => {
    const processTranscript = async () => {
      if (!currentVideoId || processedVideos.has(currentVideoId)) return;
      
      setIsProcessingTranscript(true);
      try {
        const response = await axios.get(`http://localhost:8000/public/transcript/${currentVideoId}`);
        if (response.data.status === "completed") {
          console.log("Transcript processing completed");
          setProcessedVideos(prev => new Set([...prev, currentVideoId]));
        }
      } catch (error) {
        console.error("Error processing transcript:", error);
      } finally {
        setIsProcessingTranscript(false);
      }
    };

    processTranscript();
  }, [currentVideoId, processedVideos]);

  const handlePromptSubmit = async (userPrompt) => {
    setResults(prev => [...prev, { 
      text: `**Search: ${userPrompt}**`,
      type: 'user'
    }]);

    setIsStreaming(true);
    setCurrentStreamingText('');

    try {
      const contextResponse = await axios.post(
        'http://localhost:8000/public/chat',
        { message: userPrompt }
      );

      const context = contextResponse.data.context;
      console.log("Retrieved context:", context);

      const response = await fetch('http://localhost:8000/public/gpt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userPrompt,
          context: context
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(5).trim();
            
            if (data === '[DONE]') {
              setIsStreaming(false);
              console.log("Full response before timestamp extraction:", fullResponse);
              const newTimestamps = extractTimestamps(fullResponse);
              console.log("Setting new timestamps:", newTimestamps);
              setTimestamps(prev => {
                const combined = [...new Set([...prev, ...newTimestamps])];
                console.log("Combined timestamps:", combined);
                return combined;
              });
              
              setResults(prev => [...prev, { 
                text: fullResponse,
                type: 'gpt'
              }]);
              setCurrentStreamingText('');
              break;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                const currentContent = parsed.content;
                fullResponse += currentContent;
                setCurrentStreamingText(prev => prev + currentContent);
              }
            } catch (e) {
              console.error('Error parsing streaming data:', e, 'Raw data:', data);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error processing prompt:", error);
      setResults(prev => [...prev, { 
        text: "Sorry, I encountered an error processing your request. Please try again.",
        type: 'gpt'
      }]);
      setIsStreaming(false);
      setCurrentStreamingText('');
    }
  };

  return (
    <div className="App">
      <ProgressBar 
        timestamps={timestamps} 
        currentTime={currentTime}
        duration={videoDuration}
        progress={progress}
      />
      <ResultsArea 
        results={results} 
        isStreaming={isStreaming}
        currentStreamingText={currentStreamingText}
        isProcessingTranscript={isProcessingTranscript}
      />
      <PromptBar onSubmit={handlePromptSubmit} />
    </div>
  );
}

export default App;
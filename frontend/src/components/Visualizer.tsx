import React, { useEffect, useRef } from 'react';
import { bridge } from '../bridge/MusicBridge';

interface VisualizerProps {
  isPlaying: boolean;
  theme: string;
}

export const Visualizer: React.FC<VisualizerProps> = ({ isPlaying, theme }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<any | null>(null);
  const dataArrayRef = useRef<any | null>(null);
  const audioSetupRef = useRef<boolean>(false);

  useEffect(() => {
    const platform = bridge.getPlatform();
    if (platform !== 'android' && isPlaying && !audioSetupRef.current) {
      const audioDetails = bridge.getAudioContext();
      if (audioDetails) {
        try {
          const { context, source } = audioDetails;
          const analyser = context.createAnalyser();
          analyser.fftSize = 128;
          source.connect(analyser);
          analyser.connect(context.destination);
          
          analyserRef.current = analyser;
          const bufferLength = analyser.frequencyBinCount;
          dataArrayRef.current = new Uint8Array(bufferLength);
          audioSetupRef.current = true;
          console.log('Visualizer: Real audio analyser connected');
        } catch (e) {
          console.warn('Could not connect real audio analyser:', e);
        }
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width = canvas.offsetWidth;
    let height = canvas.height = canvas.offsetHeight;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', handleResize);

    const platform = bridge.getPlatform();
    let simOffset = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const styles = getComputedStyle(document.documentElement);
      const accentColor = styles.getPropertyValue('--accent').trim() || '#88c0d0';
      const textMuted = styles.getPropertyValue('--text-muted').trim() || 'rgba(255,255,255,0.4)';

      if (platform !== 'android' && analyserRef.current && dataArrayRef.current && isPlaying) {
        const analyser = analyserRef.current;
        const dataArray = dataArrayRef.current;
        analyser.getByteFrequencyData(dataArray);

        const barCount = dataArray.length;
        const barWidth = (width / barCount) * 1.5;
        let barHeight;
        let x = 0;

        ctx.fillStyle = accentColor;

        for (let i = 0; i < barCount; i++) {
          const value = dataArray[i];
          barHeight = (value / 255) * height * 0.8;

          const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
          gradient.addColorStop(0, accentColor + '22');
          gradient.addColorStop(0.5, accentColor + 'aa');
          gradient.addColorStop(1, accentColor);

          ctx.fillStyle = gradient;

          const y = height - barHeight;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth - 4, barHeight, 6);
          ctx.fill();

          x += barWidth;
        }
      } else {
        const waveCount = 3;
        const speed = isPlaying ? 0.05 : 0.005;
        simOffset += speed;

        for (let w = 0; w < waveCount; w++) {
          ctx.beginPath();
          ctx.lineWidth = w === 0 ? 3 : 1.5;
          
          let color = accentColor;
          if (w === 1) color = accentColor + '66';
          if (w === 2) color = textMuted + '33';
          
          ctx.strokeStyle = color;

          const amplitude = isPlaying 
            ? (height * 0.35) / (w + 1) 
            : (height * 0.05) / (w + 1);

          for (let x = 0; x < width; x++) {
            const freq = 0.008 + (w * 0.004);
            const y = height / 2 + Math.sin(x * freq + simOffset + w * 2) * amplitude;
            
            if (x === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
        }
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, theme]);

  return (
    <div style={{ width: '100%', height: '100px', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
      <canvas 
        ref={canvasRef} 
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
};

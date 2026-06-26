import React from 'react';

export default function Background() {
  return (
    <>
      <div
        id="bg-canvas"
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 60% 40% at 70% 20%, rgba(38,110,66,.18) 0%, transparent 60%),
            radial-gradient(ellipse 40% 60% at 20% 80%, rgba(201,162,39,.07) 0%, transparent 60%),
            var(--surf0)
          `
        }}
      >
        <div className="absolute inset-0 z-[-1]" style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,.015) 1px,transparent 1px),
            linear-gradient(90deg,rgba(255,255,255,.015) 1px,transparent 1px)
          `,
          backgroundSize: '60px 60px'
        }} />
        <div className="absolute inset-0 z-[-1]" style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, var(--surf0) 100%)'
        }} />
      </div>
      <div 
        className="fixed rounded-full blur-[100px] pointer-events-none -z-10 orb orb1 w-[700px] h-[700px] -top-[200px] -right-[200px]"
        style={{
          background: 'radial-gradient(circle,rgba(42,122,68,.2),transparent 70%)',
          animation: 'orbMove 20s ease-in-out infinite'
        }}
      />
      <div 
        className="fixed rounded-full blur-[100px] pointer-events-none -z-10 orb orb2 w-[500px] h-[500px] -bottom-[150px] -left-[100px]"
        style={{
          background: 'radial-gradient(circle,rgba(201,162,39,.08),transparent 70%)',
          animation: 'orbMove2 25s ease-in-out infinite'
        }}
      />
    </>
  );
}

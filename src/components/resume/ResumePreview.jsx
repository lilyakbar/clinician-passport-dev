import React from "react";
import { X } from "lucide-react";

export default function ResumePreview({ resume, onRemoveBullet }) {
  if (!resume) return null;

  return (
    <div
      id="resume-document"
      className="bg-white rounded-xl shadow-card p-10 sm:p-14"
      style={{ color: '#1f2937', fontFamily: 'Inter, sans-serif' }}
    >
      {/* Header */}
      <div className="pb-4 mb-6" style={{ borderBottom: '2px solid #397B75' }}>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#172033', fontFamily: 'Manrope, sans-serif' }}>
          {resume.header?.name || ""}
          {resume.header?.credentials ? `, ${resume.header.credentials}` : ""}
        </h1>
        {resume.header?.title && (
          <p className="text-base mt-1.5 font-medium" style={{ color: '#397B75' }}>
            {resume.header.title}
          </p>
        )}
      </div>

      {/* Summary */}
      {resume.summary && (
        <div className="mb-6">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: '#172033', fontFamily: 'Manrope, sans-serif' }}>
            Professional Summary
          </h2>
          <p className="text-[13.5px] leading-relaxed">{resume.summary}</p>
        </div>
      )}

      {/* Sections */}
      {resume.sections?.map((section, i) => (
        <div key={i} className="mb-5">
          <h2
            className="text-[11px] font-bold uppercase tracking-[0.1em] mb-2 pb-1"
            style={{ color: '#172033', fontFamily: 'Manrope, sans-serif', borderBottom: '1px solid #e5e7eb' }}
          >
            {section.title}
          </h2>
          <ul className="space-y-1.5">
            {section.bullets?.map((bullet, j) => (
              <li key={j} className="group flex items-start gap-2 text-[13.5px] leading-relaxed">
                <span style={{ color: '#397B75' }} className="mt-[2px] shrink-0">•</span>
                <span className="flex-1">{bullet.text}</span>
                {onRemoveBullet && (
                  <button
                    onClick={() => onRemoveBullet(i, j)}
                    className="no-print shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-100"
                    title="Remove from resume"
                  >
                    <X className="h-3.5 w-3.5" style={{ color: '#9ca3af' }} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
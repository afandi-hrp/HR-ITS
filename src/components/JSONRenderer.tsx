import React from 'react';

interface JSONRendererProps {
  data: any;
}

export default function JSONRenderer({ data }: JSONRendererProps) {
  if (!data) return null;

  let parsedData = data;
  if (typeof data === 'string') {
    try {
      parsedData = JSON.parse(data);
    } catch (e) {
      // If it's a string but not JSON, just return the string
      return <div className="whitespace-pre-wrap">{data}</div>;
    }
  }

  if (typeof parsedData !== 'object' || parsedData === null) {
    return <div className="whitespace-pre-wrap">{String(parsedData)}</div>;
  }

  const renderValue = (value: any): React.ReactNode => {
    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-slate-400 italic">Kosong</span>;
      return (
        <ul className="list-disc pl-5 space-y-1 mt-1">
          {value.map((item, index) => (
            <li key={index}>{renderValue(item)}</li>
          ))}
        </ul>
      );
    } else if (typeof value === 'object' && value !== null) {
      return (
        <div className="pl-4 border-l-2 border-indigo-100 mt-1 space-y-2">
          {Object.entries(value).map(([k, v]) => (
            <div key={k}>
              <span className="font-semibold text-slate-700 capitalize">{k.replace(/_/g, ' ')}:</span>{' '}
              {renderValue(v)}
            </div>
          ))}
        </div>
      );
    } else if (typeof value === 'boolean') {
      return value ? 'Ya' : 'Tidak';
    } else {
      // Handle string with newlines
      if (typeof value === 'string' && value.includes('\n')) {
        return <div className="whitespace-pre-wrap">{value}</div>;
      }
      return <span className="text-slate-600">{String(value)}</span>;
    }
  };

  return (
    <div className="space-y-3">
      {Object.entries(parsedData).map(([key, value]) => (
        <div key={key} className="bg-white/50 rounded-lg p-3 border border-indigo-50">
          <h5 className="font-bold text-indigo-900 capitalize mb-1">{key.replace(/_/g, ' ')}</h5>
          <div className="text-sm">
            {renderValue(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

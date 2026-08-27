import React from "react";

export const formatAsNumberedList = (
  text?: string | null,
  emptyFallback?: React.ReactNode,
  isAssessmentReason: boolean = false,
) => {
  if (!text) return emptyFallback;

  let normalizedText = text.replace(/\\n/g, "\n");

  if (isAssessmentReason) {
    normalizedText = normalizedText
      .replace(
        /\s*-\s*(Relevance|Hard Skills|Experience|Business Impact|Education|Soft Skills)/gi,
        "\n$1",
      )
      .replace(
        /(?:^|\s+)\d+[\.\)]\s*(Relevance|Hard Skills|Experience|Business Impact|Education|Soft Skills)/gi,
        "\n$1",
      );
  }

  const lines = normalizedText
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  const mainPoints: string[] = [];
  const conclusionPoints: string[] = [];
  let passedSoftSkills = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let isBullet =
      /^[-•*]\s*/.test(line) || /^\d+[\.\)]\s*/.test(line) || i === 0;

    if (
      isAssessmentReason &&
      /^(?:Relevance|Hard Skills|Experience|Business Impact|Education|Soft Skills)/i.test(
        line,
      )
    ) {
      isBullet = true;
    }

    if (!isAssessmentReason) {
      isBullet = true;
    } else if (passedSoftSkills) {
      isBullet = true;
    }

    const cleanLine = line
      .replace(/^[-•*]\s*/, "")
      .replace(/^\d+[\.\)]\s*/, "")
      .trim();

    if (isAssessmentReason) {
      if (passedSoftSkills) {
        if (isBullet || conclusionPoints.length === 0) {
          conclusionPoints.push(cleanLine);
        } else {
          conclusionPoints[conclusionPoints.length - 1] += " " + cleanLine;
        }
      } else {
        if (isBullet || mainPoints.length === 0) {
          mainPoints.push(cleanLine);
        } else {
          mainPoints[mainPoints.length - 1] += " " + cleanLine;
        }
        if (line.toLowerCase().includes("soft skills")) {
          passedSoftSkills = true;
        }
      }
    } else {
      if (isBullet || mainPoints.length === 0) {
        mainPoints.push(cleanLine);
      } else {
        mainPoints[mainPoints.length - 1] += " " + cleanLine;
      }
    }
  }

  if (mainPoints.length === 0 && conclusionPoints.length === 0)
    return emptyFallback;

  return (
    <div className="space-y-3">
      {mainPoints.length > 0 && (
        <ol className="list-decimal pl-4 space-y-1">
          {mainPoints.map((point, idx) => {
            if (isAssessmentReason) {
              const prefixRegex = /^(Relevance(?: to the Position)?|Hard Skills(?: \/ Core Competencies)?|Experience(?: & Seniority Level)?|Business Impact(?: \/ Performance)?|Education(?:\/Cert\/Legal)?|Soft Skills(?: & Karakter)?)(.*)/i;
              const match = point.match(prefixRegex);
              if (match) {
                const titlePart = match[1];
                let restOfLine = match[2];
                let scorePart = "";

                const scoreRegex = /^(\s*:\s*|\s+)?(\(\s*[\d\.\s]+\s*\/\s*[\d\.\s]+\s*\)|\bSkor\s*[\d\.\s]+(?:\s*\/\s*[\d\.\s]+)?\b|\b[\d\.\s]+\s*\/\s*[\d\.\s]+\b)(.*)/i;
                const scoreMatch = restOfLine.match(scoreRegex);

                let separator = "";
                let description = restOfLine;

                if (scoreMatch) {
                  separator = scoreMatch[1] || "";
                  scorePart = scoreMatch[2];
                  description = scoreMatch[3];
                }

                const hasColon = separator.includes(":") || description.match(/^\s*:/);
                description = description.replace(/^\s*[:\-]\s*/, "").trim();

                return (
                  <li key={idx} className="leading-relaxed pl-1 mb-1.5">
                    <span className="font-bold text-[#5A305A] bg-[#F58C77] px-1.5 py-0.5 rounded mr-1 inline-block mb-1 sm:mb-0">
                      {titlePart.trim()}
                    </span>
                    {scorePart && (
                      <span className="font-bold text-[#5A305A] bg-[#FFF5C5] px-1.5 py-0.5 rounded mr-1 inline-block mb-1 sm:mb-0">
                        {scorePart.trim()}
                      </span>
                    )}
                    <span className="text-[#5A305A]">
                      {hasColon ? ": " : " "}
                      {description}
                    </span>
                  </li>
                );
              }
            }
            return (
              <li key={idx} className="leading-relaxed pl-1">
                {point}
              </li>
            );
          })}
        </ol>
      )}
      {conclusionPoints.length > 0 && (
        <div className="mt-4 bg-indigo-100/50 border border-indigo-200 rounded-lg p-4 shadow-sm">
          <h5 className="font-semibold text-[#5A305A] mb-2 text-sm flex items-center gap-2">
            Kesimpulan & Rekomendasi
          </h5>
          <ol
            className="list-decimal pl-4 space-y-1"
          >
            {conclusionPoints.map((point, idx) => (
              <li
                key={idx}
                className="leading-relaxed pl-1 text-[#5A305A] font-medium"
              >
                {point}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};

export const formatLevelAndList = (
  text?: string | null,
  emptyFallback?: React.ReactNode,
) => {
  if (!text) return emptyFallback;

  const lines = text
    .replace(/\\n/g, "\n")
    .split("\n")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (lines.length === 0) return emptyFallback;

  const headerIndex = lines.findIndex((line) =>
    /\b(low|medium|high)\b/i.test(line),
  );

  let preHeaderLines: string[] = [];
  let headerText = "";
  let pointLines = lines;
  let badgeClass =
    "bg-gray-100 text-[#5A305A] font-medium px-2 py-1 rounded inline-block mb-2 mt-1";

  if (
    headerIndex !== -1 &&
    headerIndex < 3 &&
    lines[headerIndex].length < 100
  ) {
    preHeaderLines = lines.slice(0, headerIndex);
    headerText = lines[headerIndex];
    pointLines = lines.slice(headerIndex + 1);

    if (/\blow\b/i.test(headerText)) {
      badgeClass =
        "bg-red-100 text-red-800 font-semibold px-2.5 py-1 rounded-md inline-block mb-3 mt-1";
    } else if (/\bmedium\b/i.test(headerText)) {
      badgeClass =
        "bg-yellow-100 text-yellow-800 font-semibold px-2.5 py-1 rounded-md inline-block mb-3 mt-1";
    } else if (/\bhigh\b/i.test(headerText)) {
      badgeClass =
        "bg-green-100 text-green-800 font-semibold px-2.5 py-1 rounded-md inline-block mb-3 mt-1";
    }
  }

  const points = pointLines
    .map((t) =>
      t
        .replace(/^[-•*]\s*/, "")
        .replace(/^\d+[\.\)]\s*/, "")
        .trim(),
    )
    .filter((t) => t.length > 0);

  return (
    <div className="flex flex-col items-start w-full">
      {preHeaderLines.map((line, idx) => (
        <span key={`pre-${idx}`} className="mb-2 block">
          {line}
        </span>
      ))}
      {headerText ? <div className={badgeClass}>{headerText}</div> : null}
      {points.length > 0 && (
        <ol className="list-decimal pl-4 space-y-1 w-full">
          {points.map((point, idx) => (
            <li key={idx} className="leading-relaxed pl-1">
              {point}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

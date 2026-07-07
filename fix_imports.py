import re

with open('src/pages/CandidateTracking.tsx', 'r') as f:
    content = f.read()

content = content.replace('import { useEffect, useRef, useState } from "react";', '')
content = content.replace('import React, { useState, useEffect } from "react";', 'import React, { useState, useEffect, useRef } from "react";')

with open('src/pages/CandidateTracking.tsx', 'w') as f:
    f.write(content)
print("done")

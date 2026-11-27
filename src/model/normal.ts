// Adapted from Optuna v5.1.0 (_erf.py and _truncnorm.py).
// https://github.com/optuna/optuna/tree/v5.1.0/optuna/samplers/_tpe
//
// MIT License
//
// Copyright (c) 2018 Preferred Networks, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
// This code is the modified version of erf function in FreeBSD's standard C library.
// origin: FreeBSD /usr/src/lib/msun/src/s_erf.c
// https://github.com/freebsd/freebsd-src/blob/main/lib/msun/src/s_erf.c

// /* @(#)s_erf.c 5.1 93/09/24 */
// /*
//  * ====================================================
//  * Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
//  *
//  * Developed at SunPro, a Sun Microsystems, Inc. business.
//  * Permission to use, copy, modify, and distribute this
//  * software is freely granted, provided that this notice
//  * is preserved.
//  * ====================================================
//  */
//
// This file contains the codes from SciPy project.
//
// Copyright (c) 2001-2002 Enthought, Inc. 2003-2022, SciPy Developers.
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions
// are met:
//
// 1. Redistributions of source code must retain the above copyright
//    notice, this list of conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above
//    copyright notice, this list of conditions and the following
//    disclaimer in the documentation and/or other materials provided
//    with the distribution.
//
// 3. Neither the name of the copyright holder nor the names of its
//    contributors may be used to endorse or promote products derived
//    from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

// Coefficients for pp below 0.84375.
const smallNumerator = [
  1.28379167095512558561e-01,
  -3.25042107247001499370e-01,
  -2.84817495755985104766e-02,
  -5.77027029648944159157e-03,
  -2.37630166566501626084e-05,
];
const smallDenominator = [
  1,
  3.97917223959155352819e-01,
  6.50222499887672944485e-02,
  5.08130628187576562776e-03,
  1.32494738004321644526e-04,
  -3.96022827877536812320e-06,
];
// Coefficients for pa below 1.25.
const nearOneNumerator = [
  -2.36211856075265944077e-03,
  4.14856118683748331666e-01,
  -3.72207876035701323847e-01,
  3.18346619901161753674e-01,
  -1.10894694282396677476e-01,
  3.54783043256182359371e-02,
  -2.16637559486879084300e-03,
];
const nearOneDenominator = [
  1,
  1.06420880400844228286e-01,
  5.40397917702171048937e-01,
  7.18286544141962662868e-02,
  1.26171219808761642112e-01,
  1.36370839120290507362e-02,
  1.19844998467991074170e-02,
];
// Coefficients for ra below 1 / 0.35.
const tailNumerator = [
  -9.86494403484714822705e-03,
  -6.93858572707181764372e-01,
  -1.05586262253232909814e01,
  -6.23753324503260060396e01,
  -1.62396669462573470355e02,
  -1.84605092906711035994e02,
  -8.12874355063065934246e01,
  -9.81432934416914548592e00,
];
const tailDenominator = [
  1,
  1.96512716674392571292e01,
  1.37657754143519042600e02,
  4.34565877475229228821e02,
  6.45387271733267880336e02,
  4.29008140027567833386e02,
  1.08635005541779435134e02,
  6.57024977031928170135e00,
  -6.04244152148580987438e-02,
];
// Coefficients for rb above 1 / 0.35.
const farTailNumerator = [
  -9.86494292470009928597e-03,
  -7.99283237680523006574e-01,
  -1.77579549177547519889e01,
  -1.60636384855821916062e02,
  -6.37566443368389627722e02,
  -1.02509513161107724954e03,
  -4.83519191608651397019e02,
];
const farTailDenominator = [
  1,
  3.03380607434824582924e01,
  3.25792512996573918826e02,
  1.53672958608443695994e03,
  3.19985821950859553908e03,
  2.55305040643316442583e03,
  4.74528541206955367215e02,
  -2.24409524465858183362e01,
];

export const logSqrtTwoPi = 0.5 * Math.log(2 * Math.PI);

function polynomial(x: number, coefficients: readonly number[]): number {
  return coefficients.reduceRight((value, coefficient) => value * x + coefficient);
}

// In the tail, evaluate erfc directly to preserve the digits lost in 1 - erf(x).
function erfcTail(x: number): number {
  const square = x * x;
  const reciprocalSquare = 1 / square;
  const correction = x < 1 / 0.35
    ? polynomial(reciprocalSquare, tailNumerator) / polynomial(reciprocalSquare, tailDenominator)
    : polynomial(reciprocalSquare, farTailNumerator) / polynomial(reciprocalSquare, farTailDenominator);
  return Math.exp(-square - 0.5625 + correction) / x;
}

export function erf(x: number): number {
  const magnitude = Math.abs(x);
  if (magnitude < 2 ** -28) return (1 + 1.28379167095512586316e-01) * x;
  if (magnitude < 0.84375) {
    const square = x * x;
    return x * (1 + polynomial(square, smallNumerator) / polynomial(square, smallDenominator));
  }
  if (magnitude < 1.25) {
    const offset = magnitude - 1;
    return Math.sign(x) * (8.45062911510467529297e-01 + polynomial(offset, nearOneNumerator) / polynomial(offset, nearOneDenominator));
  }
  return Math.sign(x) * (magnitude < 6 ? 1 - erfcTail(magnitude) : 1);
}

export function normalLeftTail(x: number): number {
  const scaled = -x / Math.SQRT2;
  return 0.5 * (scaled < 1.25 ? 1 - erf(scaled) : erfcTail(scaled));
}

export function logNdtr(x: number): number {
  if (x > 0) return Math.log1p(-normalLeftTail(-x));
  if (x > -20) return Math.log(normalLeftTail(x));

  const square = x * x;
  // Optuna's asymptotic expansion for the log CDF below -20.
  let sum = 1;
  let term = 1;
  for (let i = 1; Math.abs(term) > Number.EPSILON; i++) {
    term *= -(2 * i - 1) / square;
    sum += term;
  }
  return -0.5 * square - Math.log(-x) - logSqrtTwoPi + Math.log(sum);
}

export function normalPdf(z: number): number {
  return Math.exp(-0.5 * z * z - logSqrtTwoPi);
}

export function normalCdf(z: number): number {
  return z > 0 ? 1 - normalLeftTail(-z) : normalLeftTail(z);
}

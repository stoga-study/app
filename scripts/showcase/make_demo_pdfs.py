"""Make the realistic demo PDFs used in the showcase. Usage: python3 make_demo_pdfs.py <work dir>  (needs pymupdf)"""
import os
import sys

import pymupdf

STATS = [
    ("Week 5: Sampling Distributions", "AP Statistics, Unit 5. A sampling distribution is the distribution of a statistic, such as a sample mean or a sample proportion, across all possible random samples of the same size from one population. It describes how much a statistic varies from sample to sample."),
    ("Parameters and statistics", "A parameter describes a population and is usually unknown, such as the true mean height of all juniors. A statistic describes a sample and is used to estimate a parameter. The sample mean x-bar estimates mu, and the sample proportion p-hat estimates p."),
    ("Sampling variability", "Different random samples give different values of a statistic. This sampling variability is not a mistake. It is the natural spread we expect, and we can describe it with a sampling distribution."),
    ("Bias and variability", "An unbiased estimator has a sampling distribution centered on the true parameter. Low variability means the values cluster tightly. Larger random samples reduce variability but do not fix bias from a poor sampling method."),
    ("The sampling distribution of p-hat", "For random samples of size n, the mean of the sampling distribution of p-hat equals p. Its standard deviation is the square root of p(1 - p) divided by n, as long as the sample is less than 10% of the population."),
    ("When is p-hat approximately normal?", "Check the Large Counts condition: np is at least 10 and n(1 - p) is at least 10. When both hold, the sampling distribution of p-hat is approximately normal and we can use z-scores to find probabilities."),
    ("The sampling distribution of x-bar", "The mean of the sampling distribution of x-bar equals the population mean mu. Its standard deviation, called the standard error of the mean, equals sigma divided by the square root of n."),
    ("Why the standard error shrinks", "Each sample mean is an average, and averages soften extreme values. With more observations, one unusual value has less pull, so sample means cluster more tightly. With sigma = 12, n = 9 gives a standard error of 4, and n = 36 gives 2."),
    ("The Central Limit Theorem", "When n is large, often 30 or more, the sampling distribution of x-bar is approximately normal whatever the shape of the population. If the population is already normal, x-bar is normal for any sample size."),
    ("Worked example", "Battery life has mean 40 hours and standard deviation 6 hours. For random samples of 36 batteries, the standard error is 6 divided by 6, which is 1 hour. A sample mean below 38 hours has z = -2, a probability of about 0.023."),
]
CHEM = [
    ("Unit 3: Stoichiometry", "Honors Chemistry. Stoichiometry uses the balanced chemical equation to relate the amounts of reactants and products. Coefficients give mole ratios, not mass ratios."),
    ("The mole", "One mole contains 6.022 x 10^23 particles, Avogadro's number. Molar mass, in grams per mole, converts between the mass of a substance and the number of moles."),
    ("Mole ratios", "In 2H2 + O2 -> 2H2O, two moles of hydrogen react with one mole of oxygen to make two moles of water. Use these ratios to convert moles of one substance to moles of another."),
    ("Limiting reactant", "The limiting reactant runs out first and determines how much product forms. Find it by converting each reactant to moles of product and taking the smaller result."),
    ("Percent yield", "Percent yield equals actual yield divided by theoretical yield, times 100. Yields below 100% come from side reactions, incomplete reactions and losses during transfer."),
]


def make(path, title, pages, total):
    d = pymupdf.open()
    for i in range(total):
        h, body = pages[i % len(pages)]
        if i >= len(pages):
            h, body = f"{h} (practice {i - len(pages) + 1})", "Practice: " + body
        p = d.new_page()
        p.insert_text((72, 60), title, fontsize=9, color=(0.4, 0.4, 0.4))
        p.insert_text((72, 100), h, fontsize=18)
        p.insert_textbox(pymupdf.Rect(72, 120, 540, 700), body, fontsize=12)
        p.insert_text((540, 760), str(i + 1), fontsize=9)
    d.save(path)


out = os.path.join(sys.argv[1], "demo")
os.makedirs(out, exist_ok=True)
make(os.path.join(out, "Week 5 Sampling.pdf"), "AP Statistics, Unit 5", STATS, 24)
make(os.path.join(out, "Unit 3 Stoichiometry.pdf"), "Honors Chemistry, Unit 3", CHEM, 18)

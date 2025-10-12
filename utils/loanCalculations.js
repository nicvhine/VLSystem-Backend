/**
 * @param {number} principals
 * @param {number} interestRate 
 * @param {number} terms 
 * @param {string} loanType 
 * @returns {object} 
 */

function computeApplicationAmounts(principal, interestRate, terms, loanType) {
    let interestAmount = 0;
    let totalInterestAmount = 0;
    let appMonthlyDue = principal;
  
    if (loanType !== "open-term") {
      interestAmount = principal * (interestRate / 100);
      totalInterestAmount = interestAmount * terms;
      appMonthlyDue = (principal + totalInterestAmount) / terms;
    }
  
    const totalPayable = principal + totalInterestAmount;
  
    let serviceFee = 0;
    if (principal >= 10000 && principal <= 20000) {
      serviceFee = principal * 0.05;
    } else if (principal >= 25000 && principal <= 40000) {
      serviceFee = 1000;
    } else if (principal >= 50000 && principal <= 500000) {
      serviceFee = principal * 0.03;
    }
  
    const appNetReleased = principal - serviceFee;
  
    return {
      interestAmount,
      totalInterestAmount,
      appMonthlyDue,
      totalPayable,
      serviceFee,
      appNetReleased
    };
  }
  
  module.exports = { computeApplicationAmounts };
  
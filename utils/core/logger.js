const colors = require('ansi-colors');
const fs = require('fs');

class Logger {
    static log(message) {
        this.writeToLogFile('INFO', message);
    //    console.log(colors.green(message));
    }

    static debug(message) {
        this.writeToLogFile('DEBUG', message);
     //   console.log(colors.green(message));
    }

    static warn(message) {
        this.writeToLogFile('WARN', message);
     //   console.log(colors.green(message));
    }

    static error(message, error = null) {
        if (error) {
     //       console.error(error);clea
        }
        
        this.writeToLogFile('ERROR', message, error);
    //    console.log(colors.green(message));
    }

    static writeToLogFile(level, message, error = null) {
    }
}

module.exports = { Logger };
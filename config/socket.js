const socketIO = require('socket.io');

function initializeSocket(server) {
    const io = socketIO(server);

    io.on('connection', (socket) => {
        console.log('A user connected');

        // Handle job updates
        socket.on('newJob', (jobData) => {
            io.emit('newJob', jobData);
        });

        socket.on('updateJob', (jobData) => {
            io.emit('updateJob', jobData);
        });

        socket.on('deleteJob', (jobId) => {
            io.emit('deleteJob', jobId);
        });

        // Handle notifications
        socket.on('newNotification', (notificationData) => {
            io.emit('newNotification', notificationData);
        });

        socket.on('disconnect', () => {
            console.log('A user disconnected');
        });
    });

    return io;
}

module.exports = initializeSocket;
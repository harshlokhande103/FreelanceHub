const socketIO = require('socket.io');

function initializeSocket(server) {
    const io = socketIO(server);

    io.on('connection', (socket) => {
        console.log('A user connected');

        // Handle chat room joining
        socket.on('joinRoom', (data) => {
            if (data.clientId && data.freelancerId) {
                const roomId = `chat_${data.clientId}_${data.freelancerId}`;
                socket.join(roomId);
                console.log(`Joined room: ${roomId}`);
            }
        });

        // Handle client messages
        socket.on('clientMessage', (data) => {
            const roomId = `chat_${data.clientId}_${data.freelancerId}`;
            io.to(roomId).emit('message', {
                message: data.message,
                sender: 'client',
                timestamp: new Date().toISOString()
            });
            
            // Send notification to freelancer
            io.emit('newMessageNotification', {
                message: data.message,
                clientId: data.clientId,
                freelancerId: data.freelancerId,
                timestamp: new Date().toISOString()
            });
        });

        // Handle freelancer messages
        socket.on('freelancerMessage', (data) => {
            const roomId = `chat_${data.clientId}_${data.freelancerId}`;
            io.to(roomId).emit('message', {
                message: data.message,
                sender: 'freelancer',
                timestamp: new Date().toISOString()
            });
        });

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
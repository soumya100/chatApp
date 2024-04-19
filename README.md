# NextChat: Real-Time Chat Application with Next.js, Redis, and Upstash

NextChat is a real-time chat application built with Next.js, utilizing Redis as a database with Upstash for persistence. This application allows users to engage in seamless, responsive chat interactions across various devices.

![NextChat live Preview](https://chat-app-ten-cyan.vercel.app/)

## Features

- **Real-Time Communication**: Enjoy instant messaging with real-time updates, providing a smooth and responsive chatting experience.
- **Fully Responsive Design**: NextChat is designed to adapt seamlessly to different screen sizes, ensuring a consistent user experience across devices.
- **Persistent Storage**: Redis, managed with Upstash, ensures that chat messages are stored securely and are accessible even after page refreshes or server restarts.
- **User Authentication**: Secure user authentication ensures that only authorized users can access the chat application.
- **User Profiles**: Personalize your chat experience with user profiles, including avatars and status updates.

## Installation

To run NextChat locally, follow these steps:

1. Clone this repository to your local machine:

   ```bash
   git clone https://github.com/soumya100/chatApp.git
   ```

2. Navigate to the project directory:

   ```bash
   cd chatApp
   ```

3. Install dependencies:

   if you're using yarn (my preference)

   ```bash
   yarn install
   ```

   if you're using npm
   ```bash
   npm i 
   ```

4. Set up Redis with Upstash and configure environment variables.

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open your browser and visit `http://localhost:3000` to view the application.

## Environment Variables

NextChat requires the following environment variables to be set:

- `UPSTASH_REDIS_REST_URL`: URL of the Redis database provided by Upstash.
- `UPSTASH_REDIS_REST_TOKEN`: Secret key used for session encryption.
- `NEXTAUTH_SECRET`: Secret key for next-auth.
- `GOOGLE_CLIENT_ID`: Google console client id.
- `GOOGLE_CLIENT_SECRET`: Google client secret id.
- `PUSHER_APP_ID`: Pusher app id.
- `NEXT_PUBLIC_PUSHER_APP_KEY`:  Pusher app key.
- `PUSHER_APP_SECRET`: Pusher app secret key. 
- `PUSHER_APP_CLUSTER`: Pusher app cluster.

## Contributing

Contributions are welcome! Feel free to open issues or pull requests for any improvements or feature suggestions.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Feel free to customize this README with additional sections or information specific to your project!
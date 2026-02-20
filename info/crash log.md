-------------------------------------
Translated Report (Full Report Below)
-------------------------------------

Process:               FocusTogether [9376]
Path:                  /Users/USER/Downloads/*/FocusTogether
Identifier:            FocusTogether
Version:               0.1.0 (20260202.073425)
Code Type:             ARM-64 (Native)
Parent Process:        Exited process [9119]
Responsible:           Cursor [83951]
User ID:               501

Date/Time:             2026-02-02 15:03:30.6022 +0700
OS Version:            macOS 15.7.2 (24G325)
Report Version:        12
Anonymous UUID:        3556AA61-197E-F8C2-9C3F-39285E8948E6


Time Awake Since Boot: 340000 seconds

System Integrity Protection: enabled

Crashed Thread:        0  main  Dispatch queue: com.apple.main-thread

Exception Type:        EXC_CRASH (SIGABRT)
Exception Codes:       0x0000000000000000, 0x0000000000000000

Termination Reason:    Namespace SIGNAL, Code 6 Abort trap: 6
Terminating Process:   FocusTogether [9376]

Application Specific Information:
abort() called


Thread 0 Crashed:: main Dispatch queue: com.apple.main-thread
0   libsystem_kernel.dylib        	       0x198882388 __pthread_kill + 8
1   libsystem_pthread.dylib       	       0x1988bb848 pthread_kill + 296
2   libsystem_c.dylib             	       0x1987c49e4 abort + 124
3   FocusTogether                 	       0x105755eec std::sys::pal::unix::abort_internal::hb2eff0c11ee55adc + 12
4   FocusTogether                 	       0x1057570f8 std::process::abort::h4aa5c6a95b45c783 + 12
5   FocusTogether                 	       0x1057103c0 std::panicking::panic_with_hook::h9d9f4b295fd289e2 + 452
6   FocusTogether                 	       0x10571ffa8 std::panicking::panic_handler::_$u7b$$u7b$closure$u7d$$u7d$::h3b0d19ced6899bb8 + 104
7   FocusTogether                 	       0x10571fd50 std::sys::backtrace::__rust_end_short_backtrace::h2bd50c9fdd80557b + 12
8   FocusTogether                 	       0x10570e39c _RNvCsbgTEAFGLn1v_7___rustc17rust_begin_unwind + 32
9   FocusTogether                 	       0x105758f10 core::panicking::panic_nounwind_fmt::h6d33e9447de094e9 + 52
10  FocusTogether                 	       0x105759088 core::panicking::panic_null_pointer_dereference::hc6531458ea594ca3 + 56
11  FocusTogether                 	       0x1050a75e8 tao::platform_impl::platform::app::send_event::hee0c284e9de7c1e2 + 1488
12  AppKit                        	       0x19ce6142c -[NSApplication _handleEvent:] + 60
13  AppKit                        	       0x19c8b7c0c -[NSApplication run] + 520
14  FocusTogether                 	       0x104fe25d8 _$LT$$LP$$RP$$u20$as$u20$objc..message..MessageArguments$GT$::invoke::hff7f11a2d5327741 + 72
15  FocusTogether                 	       0x104fe7880 objc::message::platform::send_unverified::_$u7b$$u7b$closure$u7d$$u7d$::h76c4882b356c48e2 + 60
16  FocusTogether                 	       0x104fe6048 objc_exception::try::_$u7b$$u7b$closure$u7d$$u7d$::hdf9594a52988134b + 44
17  FocusTogether                 	       0x104fe4b98 objc_exception::try_no_ret::try_objc_execute_closure::hcc01e1e3c1f6f275 + 124
18  FocusTogether                 	       0x1051032a8 RustObjCExceptionTryCatch + 36
19  FocusTogether                 	       0x104fe3d64 objc_exception::try_no_ret::h792858d1523cbd19 + 116
20  FocusTogether                 	       0x104fe53f0 objc_exception::try::h6ebe53d275df2a52 + 72
21  FocusTogether                 	       0x104fe1c78 objc::exception::try::he290f8e50ca44b1e + 12
22  FocusTogether                 	       0x104fe63e8 objc::message::platform::send_unverified::h68cbc6537e8ae535 + 136
23  FocusTogether                 	       0x104efe7b4 objc::message::send_message::h542a535ce49c0aa3 + 28 (mod.rs:178) [inlined]
24  FocusTogether                 	       0x104efe7b4 tao::platform_impl::platform::event_loop::EventLoop$LT$T$GT$::run_return::he14fccb64a25b8aa + 980 (event_loop.rs:193)
25  FocusTogether                 	       0x104eff5d4 tao::platform_impl::platform::event_loop::EventLoop$LT$T$GT$::run::h1d6984c548acdeb1 + 20 (event_loop.rs:160)
26  FocusTogether                 	       0x104ef69c0 tao::event_loop::EventLoop$LT$T$GT$::run::ha6a7bfac88f03b1f + 60 (event_loop.rs:179)
27  FocusTogether                 	       0x104d26b70 _$LT$tauri_runtime_wry..Wry$LT$T$GT$$u20$as$u20$tauri_runtime..Runtime$LT$T$GT$$GT$::run::hf64fdcbaf80272f1 + 612 (lib.rs:2341)
28  FocusTogether                 	       0x104da5e14 tauri::app::App$LT$R$GT$::run::h63edd1b54a6c521d + 320 (app.rs:909)
29  FocusTogether                 	       0x104da614c tauri::app::Builder$LT$R$GT$::run::had2fa090d791b35e + 156 (app.rs:1768)
30  FocusTogether                 	       0x104da43d8 focustogether::main::h90539efae8be9a0d + 9780 (main.rs:483)
31  FocusTogether                 	       0x104decab4 core::ops::function::FnOnce::call_once::h88c23e911087d294 + 20 (function.rs:250)
32  FocusTogether                 	       0x104d875a0 std::sys::backtrace::__rust_begin_short_backtrace::h983abcbbb093ea00 + 24 (backtrace.rs:158)
33  FocusTogether                 	       0x104de147c std::rt::lang_start::_$u7b$$u7b$closure$u7d$$u7d$::h235ddfaeebbe4495 + 28 (rt.rs:206)
34  FocusTogether                 	       0x10571ab68 std::rt::lang_start_internal::h64ccb99c76f41f70 + 140
35  FocusTogether                 	       0x104de1454 std::rt::lang_start::h66cb6dcf55daaf8d + 84 (rt.rs:205)
36  FocusTogether                 	       0x104da4b54 main + 36
37  dyld                          	       0x19851ab98 start + 6076

Thread 1:: JavaScriptCore libpas scavenger
0   libsystem_kernel.dylib        	       0x19887d3cc __psynch_cvwait + 8
1   libsystem_pthread.dylib       	       0x1988bc09c _pthread_cond_wait + 984
2   JavaScriptCore                	       0x1b8b12960 scavenger_thread_main + 1584
3   libsystem_pthread.dylib       	       0x1988bbbc8 _pthread_start + 136
4   libsystem_pthread.dylib       	       0x1988b6b80 thread_start + 8

Thread 2:: WebCore: Scrolling
0   libsystem_kernel.dylib        	       0x198879c34 mach_msg2_trap + 8
1   libsystem_kernel.dylib        	       0x19888c3a0 mach_msg2_internal + 76
2   libsystem_kernel.dylib        	       0x198882764 mach_msg_overwrite + 484
3   libsystem_kernel.dylib        	       0x198879fa8 mach_msg + 24
4   CoreFoundation                	       0x1989a6c0c __CFRunLoopServiceMachPort + 160
5   CoreFoundation                	       0x1989a5528 __CFRunLoopRun + 1208
6   CoreFoundation                	       0x1989a49e8 CFRunLoopRunSpecific + 572
7   CoreFoundation                	       0x198a1e4a4 CFRunLoopRun + 64
8   JavaScriptCore                	       0x1b75c7140 WTF::Detail::CallableWrapper<WTF::RunLoop::create(WTF::ASCIILiteral, WTF::ThreadType, WTF::Thread::QOS)::$_0, void>::call() + 52
9   JavaScriptCore                	       0x1b75fe3b0 WTF::Thread::entryPoint(WTF::Thread::NewThreadContext*) + 240
10  JavaScriptCore                	       0x1b7421c9c WTF::wtfThreadEntryPoint(void*) + 16
11  libsystem_pthread.dylib       	       0x1988bbbc8 _pthread_start + 136
12  libsystem_pthread.dylib       	       0x1988b6b80 thread_start + 8

Thread 3:: tokio-runtime-worker
0   libsystem_kernel.dylib        	       0x19887fd04 kevent + 8
1   FocusTogether                 	       0x10545c44c mio::sys::unix::selector::Selector::select::h5b5666330a8b684c + 200
2   FocusTogether                 	       0x105459d28 mio::poll::Poll::poll::h18a3e381ad20ba67 + 80
3   FocusTogether                 	       0x105404850 tokio::runtime::io::driver::Driver::turn::h739492967b68b3fb + 208
4   FocusTogether                 	       0x105404774 tokio::runtime::io::driver::Driver::park::h3e5da56850b05b23 + 80
5   FocusTogether                 	       0x10541c890 tokio::runtime::driver::IoStack::park::h73bc8722b8424662 + 104
6   FocusTogether                 	       0x105445c54 tokio::runtime::time::Driver::park_internal::hf58ea7c80f4c45a5 + 440
7   FocusTogether                 	       0x105446084 tokio::runtime::time::Driver::park::h1e8466de40a285ec + 40
8   FocusTogether                 	       0x10541bd8c tokio::runtime::driver::TimeDriver::park::h9ee260b7f9a1620e + 96
9   FocusTogether                 	       0x10541c664 tokio::runtime::driver::Driver::park::h5d19c93a9d961d59 + 32
10  FocusTogether                 	       0x105440bf4 tokio::runtime::scheduler::multi_thread::park::Inner::park_driver::h663a0be2d9ee6b9b + 120
11  FocusTogether                 	       0x1054411e4 tokio::runtime::scheduler::multi_thread::park::Inner::park::hfae572ffdf0d9542 + 216
12  FocusTogether                 	       0x105441630 tokio::runtime::scheduler::multi_thread::park::Parker::park::h132c6531240678ca + 40
13  FocusTogether                 	       0x10540ac68 tokio::runtime::scheduler::multi_thread::worker::Context::park_timeout::h6bae045ee750534d + 776
14  FocusTogether                 	       0x10540bca0 tokio::runtime::scheduler::multi_thread::worker::Context::park::h6fd8386b0438fbea + 968
15  FocusTogether                 	       0x10540b750 tokio::runtime::scheduler::multi_thread::worker::Context::run::h012098ccf004c898 + 1784
16  FocusTogether                 	       0x1054088e4 tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::hec8d0468f2bbe1b0 + 104
17  FocusTogether                 	       0x105425070 tokio::runtime::context::scoped::Scoped$LT$T$GT$::set::h8f4f207fb40043e4 + 148
18  FocusTogether                 	       0x105401f78 tokio::runtime::context::set_scheduler::_$u7b$$u7b$closure$u7d$$u7d$::haf296180a9797e69 + 40
19  FocusTogether                 	       0x1054144d8 std::thread::local::LocalKey$LT$T$GT$::try_with::h791afc483119bd2b + 196
20  FocusTogether                 	       0x105413aac std::thread::local::LocalKey$LT$T$GT$::with::h89f6a807cad2f1e3 + 24
21  FocusTogether                 	       0x105401f04 tokio::runtime::context::set_scheduler::h7abe772a78d054ec + 68
22  FocusTogether                 	       0x105408808 tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::h05facbe76a4f0ead + 248
23  FocusTogether                 	       0x1054255f0 tokio::runtime::context::runtime::enter_runtime::hf2ae95d5c661367a + 188
24  FocusTogether                 	       0x1054086b0 tokio::runtime::scheduler::multi_thread::worker::run::hec7adbb00e77e548 + 600
25  FocusTogether                 	       0x105409888 tokio::runtime::scheduler::multi_thread::worker::Launch::launch::_$u7b$$u7b$closure$u7d$$u7d$::hf7c5c2c067f21715 + 24
26  FocusTogether                 	       0x105447a88 _$LT$tokio..runtime..blocking..task..BlockingTask$LT$T$GT$$u20$as$u20$core..future..future..Future$GT$::poll::h301eb4f01c177b57 + 136
27  FocusTogether                 	       0x105452458 tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::_$u7b$$u7b$closure$u7d$$u7d$::h11b6b3f2bd5493eb + 192
28  FocusTogether                 	       0x105452210 tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::h15034e48b9b41ff3 + 72
29  FocusTogether                 	       0x10543f350 tokio::runtime::task::harness::poll_future::_$u7b$$u7b$closure$u7d$$u7d$::h579c3638846ffa27 + 64
30  FocusTogether                 	       0x10544aef4 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hbc653bab54913889 + 44
31  FocusTogether                 	       0x10543ace4 std::panicking::catch_unwind::do_call::hdc7008e0f0436520 + 72
32  FocusTogether                 	       0x1054135b8 __rust_try + 32
33  FocusTogether                 	       0x10540ee10 std::panic::catch_unwind::h6cb1d6d821f2392e + 96
34  FocusTogether                 	       0x10543eee4 tokio::runtime::task::harness::poll_future::hadce4168d4e011fe + 96
35  FocusTogether                 	       0x10543f810 tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll_inner::h33e5930872acf673 + 160
36  FocusTogether                 	       0x10543fefc tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll::h6bb0b3451b818ad8 + 28
37  FocusTogether                 	       0x10541b274 tokio::runtime::task::raw::poll::hd2f2553821cd57d7 + 36
38  FocusTogether                 	       0x10541b774 tokio::runtime::task::raw::RawTask::poll::h7288203f493b28e0 + 52
39  FocusTogether                 	       0x105436c64 tokio::runtime::task::UnownedTask$LT$S$GT$::run::hf48fa3ac637b65ee + 64
40  FocusTogether                 	       0x1054380ac tokio::runtime::blocking::pool::Task::run::h9767d25d6b73c599 + 28
41  FocusTogether                 	       0x1054382d0 tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a + 536
42  FocusTogether                 	       0x1054391b8 tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d + 144
43  FocusTogether                 	       0x105418be8 std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8 + 16
44  FocusTogether                 	       0x10542f8b8 std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34 + 116
45  FocusTogether                 	       0x10544af64 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e + 44
46  FocusTogether                 	       0x10543aaec std::panicking::catch_unwind::do_call::h5a186a60818a092e + 68
47  FocusTogether                 	       0x105432e7c __rust_try + 32
48  FocusTogether                 	       0x10542f40c std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17 + 728
49  FocusTogether                 	       0x1053fafd4 core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39 + 24
50  FocusTogether                 	       0x1056fa504 std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004 + 60
51  libsystem_pthread.dylib       	       0x1988bbbc8 _pthread_start + 136
52  libsystem_pthread.dylib       	       0x1988b6b80 thread_start + 8

Thread 4:: tokio-runtime-worker
0   libsystem_kernel.dylib        	       0x19887d3cc __psynch_cvwait + 8
1   libsystem_pthread.dylib       	       0x1988bc09c _pthread_cond_wait + 984
2   FocusTogether                 	       0x10544b294 std::sys::sync::condvar::pthread::Condvar::wait::h831fd128ae8335c8 + 184
3   FocusTogether                 	       0x105447f2c std::sync::poison::condvar::Condvar::wait::haa84796d4cc5b740 + 56
4   FocusTogether                 	       0x105440e6c tokio::runtime::scheduler::multi_thread::park::Inner::park_condvar::hb412d549192a77c4 + 284
5   FocusTogether                 	       0x1054411b4 tokio::runtime::scheduler::multi_thread::park::Inner::park::hfae572ffdf0d9542 + 168
6   FocusTogether                 	       0x105441630 tokio::runtime::scheduler::multi_thread::park::Parker::park::h132c6531240678ca + 40
7   FocusTogether                 	       0x10540ac68 tokio::runtime::scheduler::multi_thread::worker::Context::park_timeout::h6bae045ee750534d + 776
8   FocusTogether                 	       0x10540bca0 tokio::runtime::scheduler::multi_thread::worker::Context::park::h6fd8386b0438fbea + 968
9   FocusTogether                 	       0x10540b750 tokio::runtime::scheduler::multi_thread::worker::Context::run::h012098ccf004c898 + 1784
10  FocusTogether                 	       0x1054088e4 tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::hec8d0468f2bbe1b0 + 104
11  FocusTogether                 	       0x105425070 tokio::runtime::context::scoped::Scoped$LT$T$GT$::set::h8f4f207fb40043e4 + 148
12  FocusTogether                 	       0x105401f78 tokio::runtime::context::set_scheduler::_$u7b$$u7b$closure$u7d$$u7d$::haf296180a9797e69 + 40
13  FocusTogether                 	       0x1054144d8 std::thread::local::LocalKey$LT$T$GT$::try_with::h791afc483119bd2b + 196
14  FocusTogether                 	       0x105413aac std::thread::local::LocalKey$LT$T$GT$::with::h89f6a807cad2f1e3 + 24
15  FocusTogether                 	       0x105401f04 tokio::runtime::context::set_scheduler::h7abe772a78d054ec + 68
16  FocusTogether                 	       0x105408808 tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::h05facbe76a4f0ead + 248
17  FocusTogether                 	       0x1054255f0 tokio::runtime::context::runtime::enter_runtime::hf2ae95d5c661367a + 188
18  FocusTogether                 	       0x1054086b0 tokio::runtime::scheduler::multi_thread::worker::run::hec7adbb00e77e548 + 600
19  FocusTogether                 	       0x105409888 tokio::runtime::scheduler::multi_thread::worker::Launch::launch::_$u7b$$u7b$closure$u7d$$u7d$::hf7c5c2c067f21715 + 24
20  FocusTogether                 	       0x105447a88 _$LT$tokio..runtime..blocking..task..BlockingTask$LT$T$GT$$u20$as$u20$core..future..future..Future$GT$::poll::h301eb4f01c177b57 + 136
21  FocusTogether                 	       0x105452458 tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::_$u7b$$u7b$closure$u7d$$u7d$::h11b6b3f2bd5493eb + 192
22  FocusTogether                 	       0x105452210 tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::h15034e48b9b41ff3 + 72
23  FocusTogether                 	       0x10543f350 tokio::runtime::task::harness::poll_future::_$u7b$$u7b$closure$u7d$$u7d$::h579c3638846ffa27 + 64
24  FocusTogether                 	       0x10544aef4 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hbc653bab54913889 + 44
25  FocusTogether                 	       0x10543ace4 std::panicking::catch_unwind::do_call::hdc7008e0f0436520 + 72
26  FocusTogether                 	       0x1054135b8 __rust_try + 32
27  FocusTogether                 	       0x10540ee10 std::panic::catch_unwind::h6cb1d6d821f2392e + 96
28  FocusTogether                 	       0x10543eee4 tokio::runtime::task::harness::poll_future::hadce4168d4e011fe + 96
29  FocusTogether                 	       0x10543f810 tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll_inner::h33e5930872acf673 + 160
30  FocusTogether                 	       0x10543fefc tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll::h6bb0b3451b818ad8 + 28
31  FocusTogether                 	       0x10541b274 tokio::runtime::task::raw::poll::hd2f2553821cd57d7 + 36
32  FocusTogether                 	       0x10541b774 tokio::runtime::task::raw::RawTask::poll::h7288203f493b28e0 + 52
33  FocusTogether                 	       0x105436c64 tokio::runtime::task::UnownedTask$LT$S$GT$::run::hf48fa3ac637b65ee + 64
34  FocusTogether                 	       0x1054380ac tokio::runtime::blocking::pool::Task::run::h9767d25d6b73c599 + 28
35  FocusTogether                 	       0x1054382d0 tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a + 536
36  FocusTogether                 	       0x1054391b8 tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d + 144
37  FocusTogether                 	       0x105418be8 std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8 + 16
38  FocusTogether                 	       0x10542f8b8 std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34 + 116
39  FocusTogether                 	       0x10544af64 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e + 44
40  FocusTogether                 	       0x10543aaec std::panicking::catch_unwind::do_call::h5a186a60818a092e + 68
41  FocusTogether                 	       0x105432e7c __rust_try + 32
42  FocusTogether                 	       0x10542f40c std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17 + 728
43  FocusTogether                 	       0x1053fafd4 core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39 + 24
44  FocusTogether                 	       0x1056fa504 std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004 + 60
45  libsystem_pthread.dylib       	       0x1988bbbc8 _pthread_start + 136
46  libsystem_pthread.dylib       	       0x1988b6b80 thread_start + 8

Thread 5:: tokio-runtime-worker
0   libsystem_kernel.dylib        	       0x19887d3cc __psynch_cvwait + 8
1   libsystem_pthread.dylib       	       0x1988bc09c _pthread_cond_wait + 984
2   FocusTogether                 	       0x10544b294 std::sys::sync::condvar::pthread::Condvar::wait::h831fd128ae8335c8 + 184
3   FocusTogether                 	       0x105447f2c std::sync::poison::condvar::Condvar::wait::haa84796d4cc5b740 + 56
4   FocusTogether                 	       0x105440e6c tokio::runtime::scheduler::multi_thread::park::Inner::park_condvar::hb412d549192a77c4 + 284
5   FocusTogether                 	       0x1054411b4 tokio::runtime::scheduler::multi_thread::park::Inner::park::hfae572ffdf0d9542 + 168
6   FocusTogether                 	       0x105441630 tokio::runtime::scheduler::multi_thread::park::Parker::park::h132c6531240678ca + 40
7   FocusTogether                 	       0x10540ac68 tokio::runtime::scheduler::multi_thread::worker::Context::park_timeout::h6bae045ee750534d + 776
8   FocusTogether                 	       0x10540bca0 tokio::runtime::scheduler::multi_thread::worker::Context::park::h6fd8386b0438fbea + 968
9   FocusTogether                 	       0x10540b750 tokio::runtime::scheduler::multi_thread::worker::Context::run::h012098ccf004c898 + 1784
10  FocusTogether                 	       0x1054088e4 tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::hec8d0468f2bbe1b0 + 104
11  FocusTogether                 	       0x105425070 tokio::runtime::context::scoped::Scoped$LT$T$GT$::set::h8f4f207fb40043e4 + 148
12  FocusTogether                 	       0x105401f78 tokio::runtime::context::set_scheduler::_$u7b$$u7b$closure$u7d$$u7d$::haf296180a9797e69 + 40
13  FocusTogether                 	       0x1054144d8 std::thread::local::LocalKey$LT$T$GT$::try_with::h791afc483119bd2b + 196
14  FocusTogether                 	       0x105413aac std::thread::local::LocalKey$LT$T$GT$::with::h89f6a807cad2f1e3 + 24
15  FocusTogether                 	       0x105401f04 tokio::runtime::context::set_scheduler::h7abe772a78d054ec + 68
16  FocusTogether                 	       0x105408808 tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::h05facbe76a4f0ead + 248
17  FocusTogether                 	       0x1054255f0 tokio::runtime::context::runtime::enter_runtime::hf2ae95d5c661367a + 188
18  FocusTogether                 	       0x1054086b0 tokio::runtime::scheduler::multi_thread::worker::run::hec7adbb00e77e548 + 600
19  FocusTogether                 	       0x105409888 tokio::runtime::scheduler::multi_thread::worker::Launch::launch::_$u7b$$u7b$closure$u7d$$u7d$::hf7c5c2c067f21715 + 24
20  FocusTogether                 	       0x105447a88 _$LT$tokio..runtime..blocking..task..BlockingTask$LT$T$GT$$u20$as$u20$core..future..future..Future$GT$::poll::h301eb4f01c177b57 + 136
21  FocusTogether                 	       0x105452458 tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::_$u7b$$u7b$closure$u7d$$u7d$::h11b6b3f2bd5493eb + 192
22  FocusTogether                 	       0x105452210 tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::h15034e48b9b41ff3 + 72
23  FocusTogether                 	       0x10543f350 tokio::runtime::task::harness::poll_future::_$u7b$$u7b$closure$u7d$$u7d$::h579c3638846ffa27 + 64
24  FocusTogether                 	       0x10544aef4 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hbc653bab54913889 + 44
25  FocusTogether                 	       0x10543ace4 std::panicking::catch_unwind::do_call::hdc7008e0f0436520 + 72
26  FocusTogether                 	       0x1054135b8 __rust_try + 32
27  FocusTogether                 	       0x10540ee10 std::panic::catch_unwind::h6cb1d6d821f2392e + 96
28  FocusTogether                 	       0x10543eee4 tokio::runtime::task::harness::poll_future::hadce4168d4e011fe + 96
29  FocusTogether                 	       0x10543f810 tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll_inner::h33e5930872acf673 + 160
30  FocusTogether                 	       0x10543fefc tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll::h6bb0b3451b818ad8 + 28
31  FocusTogether                 	       0x10541b274 tokio::runtime::task::raw::poll::hd2f2553821cd57d7 + 36
32  FocusTogether                 	       0x10541b774 tokio::runtime::task::raw::RawTask::poll::h7288203f493b28e0 + 52
33  FocusTogether                 	       0x105436c64 tokio::runtime::task::UnownedTask$LT$S$GT$::run::hf48fa3ac637b65ee + 64
34  FocusTogether                 	       0x1054380ac tokio::runtime::blocking::pool::Task::run::h9767d25d6b73c599 + 28
35  FocusTogether                 	       0x1054382d0 tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a + 536
36  FocusTogether                 	       0x1054391b8 tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d + 144
37  FocusTogether                 	       0x105418be8 std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8 + 16
38  FocusTogether                 	       0x10542f8b8 std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34 + 116
39  FocusTogether                 	       0x10544af64 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e + 44
40  FocusTogether                 	       0x10543aaec std::panicking::catch_unwind::do_call::h5a186a60818a092e + 68
41  FocusTogether                 	       0x105432e7c __rust_try + 32
42  FocusTogether                 	       0x10542f40c std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17 + 728
43  FocusTogether                 	       0x1053fafd4 core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39 + 24
44  FocusTogether                 	       0x1056fa504 std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004 + 60
45  libsystem_pthread.dylib       	       0x1988bbbc8 _pthread_start + 136
46  libsystem_pthread.dylib       	       0x1988b6b80 thread_start + 8

Thread 6:: tokio-runtime-worker
0   libsystem_kernel.dylib        	       0x19887d3cc __psynch_cvwait + 8
1   libsystem_pthread.dylib       	       0x1988bc09c _pthread_cond_wait + 984
2   FocusTogether                 	       0x10544b294 std::sys::sync::condvar::pthread::Condvar::wait::h831fd128ae8335c8 + 184
3   FocusTogether                 	       0x105447f2c std::sync::poison::condvar::Condvar::wait::haa84796d4cc5b740 + 56
4   FocusTogether                 	       0x105440e6c tokio::runtime::scheduler::multi_thread::park::Inner::park_condvar::hb412d549192a77c4 + 284
5   FocusTogether                 	       0x1054411b4 tokio::runtime::scheduler::multi_thread::park::Inner::park::hfae572ffdf0d9542 + 168
6   FocusTogether                 	       0x105441630 tokio::runtime::scheduler::multi_thread::park::Parker::park::h132c6531240678ca + 40
7   FocusTogether                 	       0x10540ac68 tokio::runtime::scheduler::multi_thread::worker::Context::park_timeout::h6bae045ee750534d + 776
8   FocusTogether                 	       0x10540bca0 tokio::runtime::scheduler::multi_thread::worker::Context::park::h6fd8386b0438fbea + 968
9   FocusTogether                 	       0x10540b750 tokio::runtime::scheduler::multi_thread::worker::Context::run::h012098ccf004c898 + 1784
10  FocusTogether                 	       0x1054088e4 tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::hec8d0468f2bbe1b0 + 104
11  FocusTogether                 	       0x105425070 tokio::runtime::context::scoped::Scoped$LT$T$GT$::set::h8f4f207fb40043e4 + 148
12  FocusTogether                 	       0x105401f78 tokio::runtime::context::set_scheduler::_$u7b$$u7b$closure$u7d$$u7d$::haf296180a9797e69 + 40
13  FocusTogether                 	       0x1054144d8 std::thread::local::LocalKey$LT$T$GT$::try_with::h791afc483119bd2b + 196
14  FocusTogether                 	       0x105413aac std::thread::local::LocalKey$LT$T$GT$::with::h89f6a807cad2f1e3 + 24
15  FocusTogether                 	       0x105401f04 tokio::runtime::context::set_scheduler::h7abe772a78d054ec + 68
16  FocusTogether                 	       0x105408808 tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::h05facbe76a4f0ead + 248
17  FocusTogether                 	       0x1054255f0 tokio::runtime::context::runtime::enter_runtime::hf2ae95d5c661367a + 188
18  FocusTogether                 	       0x1054086b0 tokio::runtime::scheduler::multi_thread::worker::run::hec7adbb00e77e548 + 600
19  FocusTogether                 	       0x105409888 tokio::runtime::scheduler::multi_thread::worker::Launch::launch::_$u7b$$u7b$closure$u7d$$u7d$::hf7c5c2c067f21715 + 24
20  FocusTogether                 	       0x105447a88 _$LT$tokio..runtime..blocking..task..BlockingTask$LT$T$GT$$u20$as$u20$core..future..future..Future$GT$::poll::h301eb4f01c177b57 + 136
21  FocusTogether                 	       0x105452458 tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::_$u7b$$u7b$closure$u7d$$u7d$::h11b6b3f2bd5493eb + 192
22  FocusTogether                 	       0x105452210 tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::h15034e48b9b41ff3 + 72
23  FocusTogether                 	       0x10543f350 tokio::runtime::task::harness::poll_future::_$u7b$$u7b$closure$u7d$$u7d$::h579c3638846ffa27 + 64
24  FocusTogether                 	       0x10544aef4 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hbc653bab54913889 + 44
25  FocusTogether                 	       0x10543ace4 std::panicking::catch_unwind::do_call::hdc7008e0f0436520 + 72
26  FocusTogether                 	       0x1054135b8 __rust_try + 32
27  FocusTogether                 	       0x10540ee10 std::panic::catch_unwind::h6cb1d6d821f2392e + 96
28  FocusTogether                 	       0x10543eee4 tokio::runtime::task::harness::poll_future::hadce4168d4e011fe + 96
29  FocusTogether                 	       0x10543f810 tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll_inner::h33e5930872acf673 + 160
30  FocusTogether                 	       0x10543fefc tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll::h6bb0b3451b818ad8 + 28
31  FocusTogether                 	       0x10541b274 tokio::runtime::task::raw::poll::hd2f2553821cd57d7 + 36
32  FocusTogether                 	       0x10541b774 tokio::runtime::task::raw::RawTask::poll::h7288203f493b28e0 + 52
33  FocusTogether                 	       0x105436c64 tokio::runtime::task::UnownedTask$LT$S$GT$::run::hf48fa3ac637b65ee + 64
34  FocusTogether                 	       0x1054380ac tokio::runtime::blocking::pool::Task::run::h9767d25d6b73c599 + 28
35  FocusTogether                 	       0x1054382d0 tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a + 536
36  FocusTogether                 	       0x1054391b8 tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d + 144
37  FocusTogether                 	       0x105418be8 std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8 + 16
38  FocusTogether                 	       0x10542f8b8 std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34 + 116
39  FocusTogether                 	       0x10544af64 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e + 44
40  FocusTogether                 	       0x10543aaec std::panicking::catch_unwind::do_call::h5a186a60818a092e + 68
41  FocusTogether                 	       0x105432e7c __rust_try + 32
42  FocusTogether                 	       0x10542f40c std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17 + 728
43  FocusTogether                 	       0x1053fafd4 core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39 + 24
44  FocusTogether                 	       0x1056fa504 std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004 + 60
45  libsystem_pthread.dylib       	       0x1988bbbc8 _pthread_start + 136
46  libsystem_pthread.dylib       	       0x1988b6b80 thread_start + 8

Thread 7:: tokio-runtime-worker
0   libsystem_kernel.dylib        	       0x19887d3cc __psynch_cvwait + 8
1   libsystem_pthread.dylib       	       0x1988bc09c _pthread_cond_wait + 984
2   FocusTogether                 	       0x10544b294 std::sys::sync::condvar::pthread::Condvar::wait::h831fd128ae8335c8 + 184
3   FocusTogether                 	       0x105447f2c std::sync::poison::condvar::Condvar::wait::haa84796d4cc5b740 + 56
4   FocusTogether                 	       0x105440e6c tokio::runtime::scheduler::multi_thread::park::Inner::park_condvar::hb412d549192a77c4 + 284
5   FocusTogether                 	       0x1054411b4 tokio::runtime::scheduler::multi_thread::park::Inner::park::hfae572ffdf0d9542 + 168
6   FocusTogether                 	       0x105441630 tokio::runtime::scheduler::multi_thread::park::Parker::park::h132c6531240678ca + 40
7   FocusTogether                 	       0x10540ac68 tokio::runtime::scheduler::multi_thread::worker::Context::park_timeout::h6bae045ee750534d + 776
8   FocusTogether                 	       0x10540bca0 tokio::runtime::scheduler::multi_thread::worker::Context::park::h6fd8386b0438fbea + 968
9   FocusTogether                 	       0x10540b750 tokio::runtime::scheduler::multi_thread::worker::Context::run::h012098ccf004c898 + 1784
10  FocusTogether                 	       0x1054088e4 tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::hec8d0468f2bbe1b0 + 104
11  FocusTogether                 	       0x105425070 tokio::runtime::context::scoped::Scoped$LT$T$GT$::set::h8f4f207fb40043e4 + 148
12  FocusTogether                 	       0x105401f78 tokio::runtime::context::set_scheduler::_$u7b$$u7b$closure$u7d$$u7d$::haf296180a9797e69 + 40
13  FocusTogether                 	       0x1054144d8 std::thread::local::LocalKey$LT$T$GT$::try_with::h791afc483119bd2b + 196
14  FocusTogether                 	       0x105413aac std::thread::local::LocalKey$LT$T$GT$::with::h89f6a807cad2f1e3 + 24
15  FocusTogether                 	       0x105401f04 tokio::runtime::context::set_scheduler::h7abe772a78d054ec + 68
16  FocusTogether                 	       0x105408808 tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::h05facbe76a4f0ead + 248
17  FocusTogether                 	       0x1054255f0 tokio::runtime::context::runtime::enter_runtime::hf2ae95d5c661367a + 188
18  FocusTogether                 	       0x1054086b0 tokio::runtime::scheduler::multi_thread::worker::run::hec7adbb00e77e548 + 600
19  FocusTogether                 	       0x105409888 tokio::runtime::scheduler::multi_thread::worker::Launch::launch::_$u7b$$u7b$closure$u7d$$u7d$::hf7c5c2c067f21715 + 24
20  FocusTogether                 	       0x105447a88 _$LT$tokio..runtime..blocking..task..BlockingTask$LT$T$GT$$u20$as$u20$core..future..future..Future$GT$::poll::h301eb4f01c177b57 + 136
21  FocusTogether                 	       0x105452458 tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::_$u7b$$u7b$closure$u7d$$u7d$::h11b6b3f2bd5493eb + 192
22  FocusTogether                 	       0x105452210 tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::h15034e48b9b41ff3 + 72
23  FocusTogether                 	       0x10543f350 tokio::runtime::task::harness::poll_future::_$u7b$$u7b$closure$u7d$$u7d$::h579c3638846ffa27 + 64
24  FocusTogether                 	       0x10544aef4 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hbc653bab54913889 + 44
25  FocusTogether                 	       0x10543ace4 std::panicking::catch_unwind::do_call::hdc7008e0f0436520 + 72
26  FocusTogether                 	       0x1054135b8 __rust_try + 32
27  FocusTogether                 	       0x10540ee10 std::panic::catch_unwind::h6cb1d6d821f2392e + 96
28  FocusTogether                 	       0x10543eee4 tokio::runtime::task::harness::poll_future::hadce4168d4e011fe + 96
29  FocusTogether                 	       0x10543f810 tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll_inner::h33e5930872acf673 + 160
30  FocusTogether                 	       0x10543fefc tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll::h6bb0b3451b818ad8 + 28
31  FocusTogether                 	       0x10541b274 tokio::runtime::task::raw::poll::hd2f2553821cd57d7 + 36
32  FocusTogether                 	       0x10541b774 tokio::runtime::task::raw::RawTask::poll::h7288203f493b28e0 + 52
33  FocusTogether                 	       0x105436c64 tokio::runtime::task::UnownedTask$LT$S$GT$::run::hf48fa3ac637b65ee + 64
34  FocusTogether                 	       0x1054380ac tokio::runtime::blocking::pool::Task::run::h9767d25d6b73c599 + 28
35  FocusTogether                 	       0x1054382d0 tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a + 536
36  FocusTogether                 	       0x1054391b8 tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d + 144
37  FocusTogether                 	       0x105418be8 std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8 + 16
38  FocusTogether                 	       0x10542f8b8 std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34 + 116
39  FocusTogether                 	       0x10544af64 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e + 44
40  FocusTogether                 	       0x10543aaec std::panicking::catch_unwind::do_call::h5a186a60818a092e + 68
41  FocusTogether                 	       0x105432e7c __rust_try + 32
42  FocusTogether                 	       0x10542f40c std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17 + 728
43  FocusTogether                 	       0x1053fafd4 core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39 + 24
44  FocusTogether                 	       0x1056fa504 std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004 + 60
45  libsystem_pthread.dylib       	       0x1988bbbc8 _pthread_start + 136
46  libsystem_pthread.dylib       	       0x1988b6b80 thread_start + 8

Thread 8:: tokio-runtime-worker
0   libsystem_kernel.dylib        	       0x19887d3cc __psynch_cvwait + 8
1   libsystem_pthread.dylib       	       0x1988bc09c _pthread_cond_wait + 984
2   FocusTogether                 	       0x10544b294 std::sys::sync::condvar::pthread::Condvar::wait::h831fd128ae8335c8 + 184
3   FocusTogether                 	       0x105447f2c std::sync::poison::condvar::Condvar::wait::haa84796d4cc5b740 + 56
4   FocusTogether                 	       0x105440e6c tokio::runtime::scheduler::multi_thread::park::Inner::park_condvar::hb412d549192a77c4 + 284
5   FocusTogether                 	       0x1054411b4 tokio::runtime::scheduler::multi_thread::park::Inner::park::hfae572ffdf0d9542 + 168
6   FocusTogether                 	       0x105441630 tokio::runtime::scheduler::multi_thread::park::Parker::park::h132c6531240678ca + 40
7   FocusTogether                 	       0x10540ac68 tokio::runtime::scheduler::multi_thread::worker::Context::park_timeout::h6bae045ee750534d + 776
8   FocusTogether                 	       0x10540bca0 tokio::runtime::scheduler::multi_thread::worker::Context::park::h6fd8386b0438fbea + 968
9   FocusTogether                 	       0x10540b750 tokio::runtime::scheduler::multi_thread::worker::Context::run::h012098ccf004c898 + 1784
10  FocusTogether                 	       0x1054088e4 tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::hec8d0468f2bbe1b0 + 104
11  FocusTogether                 	       0x105425070 tokio::runtime::context::scoped::Scoped$LT$T$GT$::set::h8f4f207fb40043e4 + 148
12  FocusTogether                 	       0x105401f78 tokio::runtime::context::set_scheduler::_$u7b$$u7b$closure$u7d$$u7d$::haf296180a9797e69 + 40
13  FocusTogether                 	       0x1054144d8 std::thread::local::LocalKey$LT$T$GT$::try_with::h791afc483119bd2b + 196
14  FocusTogether                 	       0x105413aac std::thread::local::LocalKey$LT$T$GT$::with::h89f6a807cad2f1e3 + 24
15  FocusTogether                 	       0x105401f04 tokio::runtime::context::set_scheduler::h7abe772a78d054ec + 68
16  FocusTogether                 	       0x105408808 tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::h05facbe76a4f0ead + 248
17  FocusTogether                 	       0x1054255f0 tokio::runtime::context::runtime::enter_runtime::hf2ae95d5c661367a + 188
18  FocusTogether                 	       0x1054086b0 tokio::runtime::scheduler::multi_thread::worker::run::hec7adbb00e77e548 + 600
19  FocusTogether                 	       0x105409888 tokio::runtime::scheduler::multi_thread::worker::Launch::launch::_$u7b$$u7b$closure$u7d$$u7d$::hf7c5c2c067f21715 + 24
20  FocusTogether                 	       0x105447a88 _$LT$tokio..runtime..blocking..task..BlockingTask$LT$T$GT$$u20$as$u20$core..future..future..Future$GT$::poll::h301eb4f01c177b57 + 136
21  FocusTogether                 	       0x105452458 tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::_$u7b$$u7b$closure$u7d$$u7d$::h11b6b3f2bd5493eb + 192
22  FocusTogether                 	       0x105452210 tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::h15034e48b9b41ff3 + 72
23  FocusTogether                 	       0x10543f350 tokio::runtime::task::harness::poll_future::_$u7b$$u7b$closure$u7d$$u7d$::h579c3638846ffa27 + 64
24  FocusTogether                 	       0x10544aef4 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hbc653bab54913889 + 44
25  FocusTogether                 	       0x10543ace4 std::panicking::catch_unwind::do_call::hdc7008e0f0436520 + 72
26  FocusTogether                 	       0x1054135b8 __rust_try + 32
27  FocusTogether                 	       0x10540ee10 std::panic::catch_unwind::h6cb1d6d821f2392e + 96
28  FocusTogether                 	       0x10543eee4 tokio::runtime::task::harness::poll_future::hadce4168d4e011fe + 96
29  FocusTogether                 	       0x10543f810 tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll_inner::h33e5930872acf673 + 160
30  FocusTogether                 	       0x10543fefc tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll::h6bb0b3451b818ad8 + 28
31  FocusTogether                 	       0x10541b274 tokio::runtime::task::raw::poll::hd2f2553821cd57d7 + 36
32  FocusTogether                 	       0x10541b774 tokio::runtime::task::raw::RawTask::poll::h7288203f493b28e0 + 52
33  FocusTogether                 	       0x105436c64 tokio::runtime::task::UnownedTask$LT$S$GT$::run::hf48fa3ac637b65ee + 64
34  FocusTogether                 	       0x1054380ac tokio::runtime::blocking::pool::Task::run::h9767d25d6b73c599 + 28
35  FocusTogether                 	       0x1054382d0 tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a + 536
36  FocusTogether                 	       0x1054391b8 tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d + 144
37  FocusTogether                 	       0x105418be8 std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8 + 16
38  FocusTogether                 	       0x10542f8b8 std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34 + 116
39  FocusTogether                 	       0x10544af64 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e + 44
40  FocusTogether                 	       0x10543aaec std::panicking::catch_unwind::do_call::h5a186a60818a092e + 68
41  FocusTogether                 	       0x105432e7c __rust_try + 32
42  FocusTogether                 	       0x10542f40c std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17 + 728
43  FocusTogether                 	       0x1053fafd4 core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39 + 24
44  FocusTogether                 	       0x1056fa504 std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004 + 60
45  libsystem_pthread.dylib       	       0x1988bbbc8 _pthread_start + 136
46  libsystem_pthread.dylib       	       0x1988b6b80 thread_start + 8

Thread 9:: tokio-runtime-worker
0   libsystem_kernel.dylib        	       0x19887d3cc __psynch_cvwait + 8
1   libsystem_pthread.dylib       	       0x1988bc09c _pthread_cond_wait + 984
2   FocusTogether                 	       0x10544b294 std::sys::sync::condvar::pthread::Condvar::wait::h831fd128ae8335c8 + 184
3   FocusTogether                 	       0x105447f2c std::sync::poison::condvar::Condvar::wait::haa84796d4cc5b740 + 56
4   FocusTogether                 	       0x105440e6c tokio::runtime::scheduler::multi_thread::park::Inner::park_condvar::hb412d549192a77c4 + 284
5   FocusTogether                 	       0x1054411b4 tokio::runtime::scheduler::multi_thread::park::Inner::park::hfae572ffdf0d9542 + 168
6   FocusTogether                 	       0x105441630 tokio::runtime::scheduler::multi_thread::park::Parker::park::h132c6531240678ca + 40
7   FocusTogether                 	       0x10540ac68 tokio::runtime::scheduler::multi_thread::worker::Context::park_timeout::h6bae045ee750534d + 776
8   FocusTogether                 	       0x10540bca0 tokio::runtime::scheduler::multi_thread::worker::Context::park::h6fd8386b0438fbea + 968
9   FocusTogether                 	       0x10540b750 tokio::runtime::scheduler::multi_thread::worker::Context::run::h012098ccf004c898 + 1784
10  FocusTogether                 	       0x1054088e4 tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::hec8d0468f2bbe1b0 + 104
11  FocusTogether                 	       0x105425070 tokio::runtime::context::scoped::Scoped$LT$T$GT$::set::h8f4f207fb40043e4 + 148
12  FocusTogether                 	       0x105401f78 tokio::runtime::context::set_scheduler::_$u7b$$u7b$closure$u7d$$u7d$::haf296180a9797e69 + 40
13  FocusTogether                 	       0x1054144d8 std::thread::local::LocalKey$LT$T$GT$::try_with::h791afc483119bd2b + 196
14  FocusTogether                 	       0x105413aac std::thread::local::LocalKey$LT$T$GT$::with::h89f6a807cad2f1e3 + 24
15  FocusTogether                 	       0x105401f04 tokio::runtime::context::set_scheduler::h7abe772a78d054ec + 68
16  FocusTogether                 	       0x105408808 tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::h05facbe76a4f0ead + 248
17  FocusTogether                 	       0x1054255f0 tokio::runtime::context::runtime::enter_runtime::hf2ae95d5c661367a + 188
18  FocusTogether                 	       0x1054086b0 tokio::runtime::scheduler::multi_thread::worker::run::hec7adbb00e77e548 + 600
19  FocusTogether                 	       0x105409888 tokio::runtime::scheduler::multi_thread::worker::Launch::launch::_$u7b$$u7b$closure$u7d$$u7d$::hf7c5c2c067f21715 + 24
20  FocusTogether                 	       0x105447a88 _$LT$tokio..runtime..blocking..task..BlockingTask$LT$T$GT$$u20$as$u20$core..future..future..Future$GT$::poll::h301eb4f01c177b57 + 136
21  FocusTogether                 	       0x105452458 tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::_$u7b$$u7b$closure$u7d$$u7d$::h11b6b3f2bd5493eb + 192
22  FocusTogether                 	       0x105452210 tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::h15034e48b9b41ff3 + 72
23  FocusTogether                 	       0x10543f350 tokio::runtime::task::harness::poll_future::_$u7b$$u7b$closure$u7d$$u7d$::h579c3638846ffa27 + 64
24  FocusTogether                 	       0x10544aef4 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hbc653bab54913889 + 44
25  FocusTogether                 	       0x10543ace4 std::panicking::catch_unwind::do_call::hdc7008e0f0436520 + 72
26  FocusTogether                 	       0x1054135b8 __rust_try + 32
27  FocusTogether                 	       0x10540ee10 std::panic::catch_unwind::h6cb1d6d821f2392e + 96
28  FocusTogether                 	       0x10543eee4 tokio::runtime::task::harness::poll_future::hadce4168d4e011fe + 96
29  FocusTogether                 	       0x10543f810 tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll_inner::h33e5930872acf673 + 160
30  FocusTogether                 	       0x10543fefc tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll::h6bb0b3451b818ad8 + 28
31  FocusTogether                 	       0x10541b274 tokio::runtime::task::raw::poll::hd2f2553821cd57d7 + 36
32  FocusTogether                 	       0x10541b774 tokio::runtime::task::raw::RawTask::poll::h7288203f493b28e0 + 52
33  FocusTogether                 	       0x105436c64 tokio::runtime::task::UnownedTask$LT$S$GT$::run::hf48fa3ac637b65ee + 64
34  FocusTogether                 	       0x1054380ac tokio::runtime::blocking::pool::Task::run::h9767d25d6b73c599 + 28
35  FocusTogether                 	       0x1054382d0 tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a + 536
36  FocusTogether                 	       0x1054391b8 tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d + 144
37  FocusTogether                 	       0x105418be8 std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8 + 16
38  FocusTogether                 	       0x10542f8b8 std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34 + 116
39  FocusTogether                 	       0x10544af64 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e + 44
40  FocusTogether                 	       0x10543aaec std::panicking::catch_unwind::do_call::h5a186a60818a092e + 68
41  FocusTogether                 	       0x105432e7c __rust_try + 32
42  FocusTogether                 	       0x10542f40c std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17 + 728
43  FocusTogether                 	       0x1053fafd4 core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39 + 24
44  FocusTogether                 	       0x1056fa504 std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004 + 60
45  libsystem_pthread.dylib       	       0x1988bbbc8 _pthread_start + 136
46  libsystem_pthread.dylib       	       0x1988b6b80 thread_start + 8

Thread 10:: tokio-runtime-worker
0   libsystem_kernel.dylib        	       0x19887d3cc __psynch_cvwait + 8
1   libsystem_pthread.dylib       	       0x1988bc09c _pthread_cond_wait + 984
2   FocusTogether                 	       0x10544b294 std::sys::sync::condvar::pthread::Condvar::wait::h831fd128ae8335c8 + 184
3   FocusTogether                 	       0x105447f2c std::sync::poison::condvar::Condvar::wait::haa84796d4cc5b740 + 56
4   FocusTogether                 	       0x105440e6c tokio::runtime::scheduler::multi_thread::park::Inner::park_condvar::hb412d549192a77c4 + 284
5   FocusTogether                 	       0x1054411b4 tokio::runtime::scheduler::multi_thread::park::Inner::park::hfae572ffdf0d9542 + 168
6   FocusTogether                 	       0x105441630 tokio::runtime::scheduler::multi_thread::park::Parker::park::h132c6531240678ca + 40
7   FocusTogether                 	       0x10540ac68 tokio::runtime::scheduler::multi_thread::worker::Context::park_timeout::h6bae045ee750534d + 776
8   FocusTogether                 	       0x10540bca0 tokio::runtime::scheduler::multi_thread::worker::Context::park::h6fd8386b0438fbea + 968
9   FocusTogether                 	       0x10540b750 tokio::runtime::scheduler::multi_thread::worker::Context::run::h012098ccf004c898 + 1784
10  FocusTogether                 	       0x1054088e4 tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::hec8d0468f2bbe1b0 + 104
11  FocusTogether                 	       0x105425070 tokio::runtime::context::scoped::Scoped$LT$T$GT$::set::h8f4f207fb40043e4 + 148
12  FocusTogether                 	       0x105401f78 tokio::runtime::context::set_scheduler::_$u7b$$u7b$closure$u7d$$u7d$::haf296180a9797e69 + 40
13  FocusTogether                 	       0x1054144d8 std::thread::local::LocalKey$LT$T$GT$::try_with::h791afc483119bd2b + 196
14  FocusTogether                 	       0x105413aac std::thread::local::LocalKey$LT$T$GT$::with::h89f6a807cad2f1e3 + 24
15  FocusTogether                 	       0x105401f04 tokio::runtime::context::set_scheduler::h7abe772a78d054ec + 68
16  FocusTogether                 	       0x105408808 tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::h05facbe76a4f0ead + 248
17  FocusTogether                 	       0x1054255f0 tokio::runtime::context::runtime::enter_runtime::hf2ae95d5c661367a + 188
18  FocusTogether                 	       0x1054086b0 tokio::runtime::scheduler::multi_thread::worker::run::hec7adbb00e77e548 + 600
19  FocusTogether                 	       0x105409888 tokio::runtime::scheduler::multi_thread::worker::Launch::launch::_$u7b$$u7b$closure$u7d$$u7d$::hf7c5c2c067f21715 + 24
20  FocusTogether                 	       0x105447a88 _$LT$tokio..runtime..blocking..task..BlockingTask$LT$T$GT$$u20$as$u20$core..future..future..Future$GT$::poll::h301eb4f01c177b57 + 136
21  FocusTogether                 	       0x105452458 tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::_$u7b$$u7b$closure$u7d$$u7d$::h11b6b3f2bd5493eb + 192
22  FocusTogether                 	       0x105452210 tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::h15034e48b9b41ff3 + 72
23  FocusTogether                 	       0x10543f350 tokio::runtime::task::harness::poll_future::_$u7b$$u7b$closure$u7d$$u7d$::h579c3638846ffa27 + 64
24  FocusTogether                 	       0x10544aef4 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hbc653bab54913889 + 44
25  FocusTogether                 	       0x10543ace4 std::panicking::catch_unwind::do_call::hdc7008e0f0436520 + 72
26  FocusTogether                 	       0x1054135b8 __rust_try + 32
27  FocusTogether                 	       0x10540ee10 std::panic::catch_unwind::h6cb1d6d821f2392e + 96
28  FocusTogether                 	       0x10543eee4 tokio::runtime::task::harness::poll_future::hadce4168d4e011fe + 96
29  FocusTogether                 	       0x10543f810 tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll_inner::h33e5930872acf673 + 160
30  FocusTogether                 	       0x10543fefc tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll::h6bb0b3451b818ad8 + 28
31  FocusTogether                 	       0x10541b274 tokio::runtime::task::raw::poll::hd2f2553821cd57d7 + 36
32  FocusTogether                 	       0x10541b774 tokio::runtime::task::raw::RawTask::poll::h7288203f493b28e0 + 52
33  FocusTogether                 	       0x105436c64 tokio::runtime::task::UnownedTask$LT$S$GT$::run::hf48fa3ac637b65ee + 64
34  FocusTogether                 	       0x1054380ac tokio::runtime::blocking::pool::Task::run::h9767d25d6b73c599 + 28
35  FocusTogether                 	       0x1054382d0 tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a + 536
36  FocusTogether                 	       0x1054391b8 tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d + 144
37  FocusTogether                 	       0x105418be8 std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8 + 16
38  FocusTogether                 	       0x10542f8b8 std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34 + 116
39  FocusTogether                 	       0x10544af64 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e + 44
40  FocusTogether                 	       0x10543aaec std::panicking::catch_unwind::do_call::h5a186a60818a092e + 68
41  FocusTogether                 	       0x105432e7c __rust_try + 32
42  FocusTogether                 	       0x10542f40c std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17 + 728
43  FocusTogether                 	       0x1053fafd4 core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39 + 24
44  FocusTogether                 	       0x1056fa504 std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004 + 60
45  libsystem_pthread.dylib       	       0x1988bbbc8 _pthread_start + 136
46  libsystem_pthread.dylib       	       0x1988b6b80 thread_start + 8

Thread 11:: com.apple.NSEventThread
0   libsystem_kernel.dylib        	       0x198879c34 mach_msg2_trap + 8
1   libsystem_kernel.dylib        	       0x19888c3a0 mach_msg2_internal + 76
2   libsystem_kernel.dylib        	       0x198882764 mach_msg_overwrite + 484
3   libsystem_kernel.dylib        	       0x198879fa8 mach_msg + 24
4   CoreFoundation                	       0x1989a6c0c __CFRunLoopServiceMachPort + 160
5   CoreFoundation                	       0x1989a5528 __CFRunLoopRun + 1208
6   CoreFoundation                	       0x1989a49e8 CFRunLoopRunSpecific + 572
7   AppKit                        	       0x19c9e878c _NSEventThread + 140
8   libsystem_pthread.dylib       	       0x1988bbbc8 _pthread_start + 136
9   libsystem_pthread.dylib       	       0x1988b6b80 thread_start + 8

Thread 12:: tokio-runtime-worker
0   libsystem_kernel.dylib        	       0x19887d3cc __psynch_cvwait + 8
1   libsystem_pthread.dylib       	       0x1988bc09c _pthread_cond_wait + 984
2   FocusTogether                 	       0x105707d3c std::sys::sync::condvar::pthread::Condvar::wait_timeout::h55fcdfcb7dc8614a + 268
3   FocusTogether                 	       0x105447d6c std::sync::poison::condvar::Condvar::wait_timeout::he2f74d08fb615571 + 80
4   FocusTogether                 	       0x105438370 tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a + 696
5   FocusTogether                 	       0x1054391b8 tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d + 144
6   FocusTogether                 	       0x105418be8 std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8 + 16
7   FocusTogether                 	       0x10542f8b8 std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34 + 116
8   FocusTogether                 	       0x10544af64 _$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e + 44
9   FocusTogether                 	       0x10543aaec std::panicking::catch_unwind::do_call::h5a186a60818a092e + 68
10  FocusTogether                 	       0x105432e7c __rust_try + 32
11  FocusTogether                 	       0x10542f40c std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17 + 728
12  FocusTogether                 	       0x1053fafd4 core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39 + 24
13  FocusTogether                 	       0x1056fa504 std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004 + 60
14  libsystem_pthread.dylib       	       0x1988bbbc8 _pthread_start + 136
15  libsystem_pthread.dylib       	       0x1988b6b80 thread_start + 8

Thread 13:
0   libsystem_pthread.dylib       	       0x1988b6b6c start_wqthread + 0

Thread 14:
0   libsystem_pthread.dylib       	       0x1988b6b6c start_wqthread + 0

Thread 15:
0   libsystem_pthread.dylib       	       0x1988b6b6c start_wqthread + 0

Thread 16:
0   libsystem_pthread.dylib       	       0x1988b6b6c start_wqthread + 0

Thread 17:
0   libsystem_pthread.dylib       	       0x1988b6b6c start_wqthread + 0


Thread 0 crashed with ARM Thread State (64-bit):
    x0: 0x0000000000000000   x1: 0x0000000000000000   x2: 0x0000000000000000   x3: 0x0000000000000000
    x4: 0x0000000000000000   x5: 0x0000000000000002   x6: 0x000000000000000a   x7: 0x0000000000000001
    x8: 0x369a7ccbc14eec93   x9: 0x369a7cc9c7ca0e93  x10: 0x0000000000000011  x11: 0x0000000000000002
   x12: 0x0000000000000000  x13: 0x000000016b0d69d6  x14: 0x0000000000002710  x15: 0x000000000000147b
   x16: 0x0000000000000148  x17: 0x00000002078a5548  x18: 0x0000000000000000  x19: 0x0000000000000006
   x20: 0x0000000000000103  x21: 0x000000020684e2e0  x22: 0x0000000105ce5260  x23: 0x0000000000000000
   x24: 0x0000000204345000  x25: 0x0000000000000118  x26: 0x00000002003c1000  x27: 0x00000002003b4000
   x28: 0x0000000204389000   fp: 0x000000016b0d6f50   lr: 0x00000001988bb848
    sp: 0x000000016b0d6f30   pc: 0x0000000198882388 cpsr: 0x40001000
   far: 0x0000000000000000  esr: 0x56000080  Address size fault

Binary Images:
       0x104d20000 -        0x105c43fff FocusTogether (*) <9d489cdf-11ad-3077-a386-6321379f73a0> /Users/USER/Downloads/*/FocusTogether
       0x116800000 -        0x11680bfff libobjc-trampolines.dylib (*) <9a87f143-aa9d-3c46-b2e8-b3fb9215e33e> /usr/lib/libobjc-trampolines.dylib
       0x118308000 -        0x118a0ffff com.apple.AGXMetalG14G (329.2) <81127308-935a-31e5-89f4-169529f19753> /System/Library/Extensions/AGXMetalG14G.bundle/Contents/MacOS/AGXMetalG14G
       0x117dc4000 -        0x117e2bfff com.apple.AppleMetalOpenGLRenderer (1.0) <993a7f68-a0cf-32ec-bd84-9a23cd55b5e2> /System/Library/Extensions/AppleMetalOpenGLRenderer.bundle/Contents/MacOS/AppleMetalOpenGLRenderer
       0x198879000 -        0x1988b4663 libsystem_kernel.dylib (*) <e5d90565-fa1a-3112-b048-59e321191677> /usr/lib/system/libsystem_kernel.dylib
       0x1988b5000 -        0x1988c1a77 libsystem_pthread.dylib (*) <022dc315-cf35-38da-939e-03800b5beff2> /usr/lib/system/libsystem_pthread.dylib
       0x19874c000 -        0x1987cd1f7 libsystem_c.dylib (*) <e098cb59-2c56-395c-ade1-6ef590e61199> /usr/lib/system/libsystem_c.dylib
       0x19c88a000 -        0x19dd1ad1f com.apple.AppKit (6.9) <83f8017f-d50b-38ee-b055-83b7ba6a72d0> /System/Library/Frameworks/AppKit.framework/Versions/C/AppKit
       0x198514000 -        0x1985af57b dyld (*) <037bb3c1-5c6c-3ec9-af31-f5bded703b36> /usr/lib/dyld
               0x0 - 0xffffffffffffffff ??? (*) <00000000-0000-0000-0000-000000000000> ???
       0x1b741b000 -        0x1b8d2099f com.apple.JavaScriptCore (20621) <5ed49f39-1c6a-3463-85dd-209a905be0fe> /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/JavaScriptCore
       0x19892a000 -        0x198e68fff com.apple.CoreFoundation (6.9) <63fd96d1-7676-3bc8-a3bf-a13e8c12d902> /System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation
       0x1fffb2000 -        0x2000f424a com.apple.DataFrame (1.0) <af9c717f-2220-335a-928a-4c7760641f26> /System/Library/Frameworks/TabularData.framework/Versions/A/TabularData

External Modification Summary:
  Calls made by other processes targeting this process:
    task_for_pid: 0
    thread_create: 0
    thread_set_state: 0
  Calls made by this process:
    task_for_pid: 0
    thread_create: 0
    thread_set_state: 0
  Calls made by all processes on this machine:
    task_for_pid: 0
    thread_create: 0
    thread_set_state: 0


-----------
Full Report
-----------

{"app_name":"FocusTogether","timestamp":"2026-02-02 15:03:38.00 +0700","app_version":"0.1.0","slice_uuid":"9d489cdf-11ad-3077-a386-6321379f73a0","build_version":"20260202.073425","platform":1,"share_with_app_devs":1,"is_first_party":1,"bug_type":"309","os_version":"macOS 15.7.2 (24G325)","roots_installed":0,"incident_id":"8A74258B-0B1C-463C-B15B-639F73CA1AEE","name":"FocusTogether"}
{
  "uptime" : 340000,
  "procRole" : "Background",
  "version" : 2,
  "userID" : 501,
  "deployVersion" : 210,
  "modelCode" : "Mac14,2",
  "coalitionID" : 5092,
  "osVersion" : {
    "train" : "macOS 15.7.2",
    "build" : "24G325",
    "releaseType" : "User"
  },
  "captureTime" : "2026-02-02 15:03:30.6022 +0700",
  "codeSigningMonitor" : 1,
  "incident" : "8A74258B-0B1C-463C-B15B-639F73CA1AEE",
  "pid" : 9376,
  "translated" : false,
  "cpuType" : "ARM-64",
  "roots_installed" : 0,
  "bug_type" : "309",
  "procLaunch" : "2026-02-02 14:34:27.1736 +0700",
  "procStartAbsTime" : 8302706829971,
  "procExitAbsTime" : 8344546161071,
  "procName" : "FocusTogether",
  "procPath" : "\/Users\/USER\/Downloads\/*\/FocusTogether",
  "bundleInfo" : {"CFBundleVersion":"20260202.073425","CFBundleShortVersionString":"0.1.0"},
  "parentProc" : "Exited process",
  "parentPid" : 9119,
  "coalitionName" : "com.todesktop.230313mzl4w4u92",
  "crashReporterKey" : "3556AA61-197E-F8C2-9C3F-39285E8948E6",
  "appleIntelligenceStatus" : {"state":"restricted","reasons":["assetIsNotReady","siriAssetIsNotReady"]},
  "responsiblePid" : 83951,
  "responsibleProc" : "Cursor",
  "codeSigningID" : "focustogether-4d51356003eb8856",
  "codeSigningTeamID" : "",
  "codeSigningFlags" : 570556929,
  "codeSigningValidationCategory" : 10,
  "codeSigningTrustLevel" : 4294967295,
  "codeSigningAuxiliaryInfo" : 0,
  "instructionByteStream" : {"beforePC":"fyMD1f17v6n9AwCRm+D\/l78DAJH9e8Go\/w9f1sADX9YQKYDSARAA1A==","atPC":"AwEAVH8jA9X9e7+p\/QMAkZDg\/5e\/AwCR\/XvBqP8PX9bAA1\/WcAqA0g=="},
  "bootSessionUUID" : "5F538AC3-DE1A-4919-B13D-E9DA64BCFD52",
  "sip" : "enabled",
  "exception" : {"codes":"0x0000000000000000, 0x0000000000000000","rawCodes":[0,0],"type":"EXC_CRASH","signal":"SIGABRT"},
  "termination" : {"flags":0,"code":6,"namespace":"SIGNAL","indicator":"Abort trap: 6","byProc":"FocusTogether","byPid":9376},
  "asi" : {"libsystem_c.dylib":["abort() called"]},
  "extMods" : {"caller":{"thread_create":0,"thread_set_state":0,"task_for_pid":0},"system":{"thread_create":0,"thread_set_state":0,"task_for_pid":0},"targeted":{"thread_create":0,"thread_set_state":0,"task_for_pid":0},"warnings":0},
  "faultingThread" : 0,
  "threads" : [{"threadState":{"x":[{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":2},{"value":10},{"value":1},{"value":3934594439024929939},{"value":3934594430543728275},{"value":17},{"value":2},{"value":0},{"value":6091008470},{"value":10000},{"value":5243},{"value":328},{"value":8716440904},{"value":0},{"value":6},{"value":259},{"value":8699306720,"symbolLocation":224,"symbol":"_main_thread"},{"value":4392374880,"symbolLocation":320,"symbol":"anon.04bd6be1b37c6840fe6d653f8a895399.35"},{"value":0},{"value":8660471808,"symbolLocation":192,"symbol":"_csop_aliases_"},{"value":280},{"value":8593870848},{"value":8593817600},{"value":8660750336,"symbolLocation":2080,"symbol":"_controlBitfieldLock"}],"flavor":"ARM_THREAD_STATE64","lr":{"value":6854260808},"cpsr":{"value":1073745920},"fp":{"value":6091009872},"sp":{"value":6091009840},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6854026120,"matchesCrashFrame":1},"far":{"value":0}},"id":7131805,"triggered":true,"name":"main","queue":"com.apple.main-thread","frames":[{"imageOffset":37768,"symbol":"__pthread_kill","symbolLocation":8,"imageIndex":4},{"imageOffset":26696,"symbol":"pthread_kill","symbolLocation":296,"imageIndex":5},{"imageOffset":494052,"symbol":"abort","symbolLocation":124,"imageIndex":6},{"imageOffset":10706668,"symbol":"std::sys::pal::unix::abort_internal::hb2eff0c11ee55adc","symbolLocation":12,"imageIndex":0},{"imageOffset":10711288,"symbol":"std::process::abort::h4aa5c6a95b45c783","symbolLocation":12,"imageIndex":0},{"imageOffset":10421184,"symbol":"std::panicking::panic_with_hook::h9d9f4b295fd289e2","symbolLocation":452,"imageIndex":0},{"imageOffset":10485672,"symbol":"std::panicking::panic_handler::_$u7b$$u7b$closure$u7d$$u7d$::h3b0d19ced6899bb8","symbolLocation":104,"imageIndex":0},{"imageOffset":10485072,"symbol":"std::sys::backtrace::__rust_end_short_backtrace::h2bd50c9fdd80557b","symbolLocation":12,"imageIndex":0},{"imageOffset":10412956,"symbol":"_RNvCsbgTEAFGLn1v_7___rustc17rust_begin_unwind","symbolLocation":32,"imageIndex":0},{"imageOffset":10718992,"symbol":"core::panicking::panic_nounwind_fmt::h6d33e9447de094e9","symbolLocation":52,"imageIndex":0},{"imageOffset":10719368,"symbol":"core::panicking::panic_null_pointer_dereference::hc6531458ea594ca3","symbolLocation":56,"imageIndex":0},{"imageOffset":3700200,"symbol":"tao::platform_impl::platform::app::send_event::hee0c284e9de7c1e2","symbolLocation":1488,"imageIndex":0},{"imageOffset":6124588,"symbol":"-[NSApplication _handleEvent:]","symbolLocation":60,"imageIndex":7},{"imageOffset":187404,"symbol":"-[NSApplication run]","symbolLocation":520,"imageIndex":7},{"imageOffset":2893272,"symbol":"_$LT$$LP$$RP$$u20$as$u20$objc..message..MessageArguments$GT$::invoke::hff7f11a2d5327741","symbolLocation":72,"imageIndex":0},{"imageOffset":2914432,"symbol":"objc::message::platform::send_unverified::_$u7b$$u7b$closure$u7d$$u7d$::h76c4882b356c48e2","symbolLocation":60,"imageIndex":0},{"imageOffset":2908232,"symbol":"objc_exception::try::_$u7b$$u7b$closure$u7d$$u7d$::hdf9594a52988134b","symbolLocation":44,"imageIndex":0},{"imageOffset":2902936,"symbol":"objc_exception::try_no_ret::try_objc_execute_closure::hcc01e1e3c1f6f275","symbolLocation":124,"imageIndex":0},{"imageOffset":4076200,"symbol":"RustObjCExceptionTryCatch","symbolLocation":36,"imageIndex":0},{"imageOffset":2899300,"symbol":"objc_exception::try_no_ret::h792858d1523cbd19","symbolLocation":116,"imageIndex":0},{"imageOffset":2905072,"symbol":"objc_exception::try::h6ebe53d275df2a52","symbolLocation":72,"imageIndex":0},{"imageOffset":2890872,"symbol":"objc::exception::try::he290f8e50ca44b1e","symbolLocation":12,"imageIndex":0},{"imageOffset":2909160,"symbol":"objc::message::platform::send_unverified::h68cbc6537e8ae535","symbolLocation":136,"imageIndex":0},{"symbol":"objc::message::send_message::h542a535ce49c0aa3","inline":true,"imageIndex":0,"imageOffset":1959860,"symbolLocation":28,"sourceLine":178,"sourceFile":"mod.rs"},{"imageOffset":1959860,"sourceLine":193,"sourceFile":"event_loop.rs","symbol":"tao::platform_impl::platform::event_loop::EventLoop$LT$T$GT$::run_return::he14fccb64a25b8aa","imageIndex":0,"symbolLocation":980},{"imageOffset":1963476,"sourceLine":160,"sourceFile":"event_loop.rs","symbol":"tao::platform_impl::platform::event_loop::EventLoop$LT$T$GT$::run::h1d6984c548acdeb1","imageIndex":0,"symbolLocation":20},{"imageOffset":1927616,"sourceLine":179,"sourceFile":"event_loop.rs","symbol":"tao::event_loop::EventLoop$LT$T$GT$::run::ha6a7bfac88f03b1f","imageIndex":0,"symbolLocation":60},{"imageOffset":27504,"sourceLine":2341,"sourceFile":"lib.rs","symbol":"_$LT$tauri_runtime_wry..Wry$LT$T$GT$$u20$as$u20$tauri_runtime..Runtime$LT$T$GT$$GT$::run::hf64fdcbaf80272f1","imageIndex":0,"symbolLocation":612},{"imageOffset":548372,"sourceLine":909,"sourceFile":"app.rs","symbol":"tauri::app::App$LT$R$GT$::run::h63edd1b54a6c521d","imageIndex":0,"symbolLocation":320},{"imageOffset":549196,"sourceLine":1768,"sourceFile":"app.rs","symbol":"tauri::app::Builder$LT$R$GT$::run::had2fa090d791b35e","imageIndex":0,"symbolLocation":156},{"imageOffset":541656,"sourceLine":483,"sourceFile":"main.rs","symbol":"focustogether::main::h90539efae8be9a0d","imageIndex":0,"symbolLocation":9780},{"imageOffset":838324,"sourceLine":250,"sourceFile":"function.rs","symbol":"core::ops::function::FnOnce::call_once::h88c23e911087d294","imageIndex":0,"symbolLocation":20},{"imageOffset":423328,"sourceLine":158,"sourceFile":"backtrace.rs","symbol":"std::sys::backtrace::__rust_begin_short_backtrace::h983abcbbb093ea00","imageIndex":0,"symbolLocation":24},{"imageOffset":791676,"sourceLine":206,"sourceFile":"rt.rs","symbol":"std::rt::lang_start::_$u7b$$u7b$closure$u7d$$u7d$::h235ddfaeebbe4495","imageIndex":0,"symbolLocation":28},{"imageOffset":10464104,"symbol":"std::rt::lang_start_internal::h64ccb99c76f41f70","symbolLocation":140,"imageIndex":0},{"imageOffset":791636,"sourceLine":205,"sourceFile":"rt.rs","symbol":"std::rt::lang_start::h66cb6dcf55daaf8d","imageIndex":0,"symbolLocation":84},{"imageOffset":543572,"symbol":"main","symbolLocation":36,"imageIndex":0},{"imageOffset":27544,"symbol":"start","symbolLocation":6076,"imageIndex":8}]},{"id":7131853,"name":"JavaScriptCore libpas scavenger","threadState":{"x":[{"value":260},{"value":0},{"value":7455232},{"value":0},{"value":0},{"value":160},{"value":9},{"value":999999056},{"value":6093893288},{"value":0},{"value":3072},{"value":13194139536386},{"value":13194139536386},{"value":3072},{"value":0},{"value":13194139536384},{"value":305},{"value":8716440832},{"value":0},{"value":4710213696},{"value":4710213760},{"value":6093893856},{"value":999999056},{"value":9},{"value":7455232},{"value":7459329},{"value":7459584},{"value":4652007308841189376},{"value":8666951680,"symbolLocation":0,"symbol":"pas_all_heaps_count"}],"flavor":"ARM_THREAD_STATE64","lr":{"value":6854262940},"cpsr":{"value":1610616832},"fp":{"value":6093893408},"sp":{"value":6093893264},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6854005708},"far":{"value":0}},"frames":[{"imageOffset":17356,"symbol":"__psynch_cvwait","symbolLocation":8,"imageIndex":4},{"imageOffset":28828,"symbol":"_pthread_cond_wait","symbolLocation":984,"imageIndex":5},{"imageOffset":24082784,"symbol":"scavenger_thread_main","symbolLocation":1584,"imageIndex":10},{"imageOffset":27592,"symbol":"_pthread_start","symbolLocation":136,"imageIndex":5},{"imageOffset":7040,"symbol":"thread_start","symbolLocation":8,"imageIndex":5}]},{"id":7131863,"name":"WebCore: Scrolling","threadState":{"x":[{"value":268451845},{"value":21592279046},{"value":8589934592},{"value":168238163951616},{"value":0},{"value":168238163951616},{"value":2},{"value":4294967295},{"value":0},{"value":17179869184},{"value":0},{"value":2},{"value":0},{"value":0},{"value":39171},{"value":0},{"value":18446744073709551569},{"value":8716442712},{"value":0},{"value":4294967295},{"value":2},{"value":168238163951616},{"value":0},{"value":168238163951616},{"value":6095609832},{"value":8589934592},{"value":21592279046},{"value":18446744073709550527},{"value":4412409862}],"flavor":"ARM_THREAD_STATE64","lr":{"value":6854067104},"cpsr":{"value":4096},"fp":{"value":6095609680},"sp":{"value":6095609600},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6853991476},"far":{"value":0}},"frames":[{"imageOffset":3124,"symbol":"mach_msg2_trap","symbolLocation":8,"imageIndex":4},{"imageOffset":78752,"symbol":"mach_msg2_internal","symbolLocation":76,"imageIndex":4},{"imageOffset":38756,"symbol":"mach_msg_overwrite","symbolLocation":484,"imageIndex":4},{"imageOffset":4008,"symbol":"mach_msg","symbolLocation":24,"imageIndex":4},{"imageOffset":510988,"symbol":"__CFRunLoopServiceMachPort","symbolLocation":160,"imageIndex":11},{"imageOffset":505128,"symbol":"__CFRunLoopRun","symbolLocation":1208,"imageIndex":11},{"imageOffset":502248,"symbol":"CFRunLoopRunSpecific","symbolLocation":572,"imageIndex":11},{"imageOffset":1000612,"symbol":"CFRunLoopRun","symbolLocation":64,"imageIndex":11},{"imageOffset":1753408,"symbol":"WTF::Detail::CallableWrapper<WTF::RunLoop::create(WTF::ASCIILiteral, WTF::ThreadType, WTF::Thread::QOS)::$_0, void>::call()","symbolLocation":52,"imageIndex":10},{"imageOffset":1979312,"symbol":"WTF::Thread::entryPoint(WTF::Thread::NewThreadContext*)","symbolLocation":240,"imageIndex":10},{"imageOffset":27804,"symbol":"WTF::wtfThreadEntryPoint(void*)","symbolLocation":16,"imageIndex":10},{"imageOffset":27592,"symbol":"_pthread_start","symbolLocation":136,"imageIndex":5},{"imageOffset":7040,"symbol":"thread_start","symbolLocation":8,"imageIndex":5}]},{"id":7131873,"name":"tokio-runtime-worker","threadState":{"x":[{"value":4},{"value":0},{"value":0},{"value":5570484736},{"value":1024},{"value":0},{"value":0},{"value":0},{"value":1024},{"value":1},{"value":5570484736},{"value":2199023256066},{"value":512},{"value":2199023256064},{"value":18446744073709205670},{"value":0},{"value":363},{"value":8716442552},{"value":0},{"value":5547367040},{"value":4694343680},{"value":5547378128},{"value":4392082976,"symbolLocation":2664,"symbol":"tokio::runtime::task::waker::WAKER_VTABLE::hf2f76bb4c225a89f"},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0}],"flavor":"ARM_THREAD_STATE64","lr":{"value":4383425612},"cpsr":{"value":2684358656},"fp":{"value":6100619072},"sp":{"value":6100618912},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6854016260},"far":{"value":0}},"frames":[{"imageOffset":27908,"symbol":"kevent","symbolLocation":8,"imageIndex":4},{"imageOffset":7586892,"symbol":"mio::sys::unix::selector::Selector::select::h5b5666330a8b684c","symbolLocation":200,"imageIndex":0},{"imageOffset":7576872,"symbol":"mio::poll::Poll::poll::h18a3e381ad20ba67","symbolLocation":80,"imageIndex":0},{"imageOffset":7227472,"symbol":"tokio::runtime::io::driver::Driver::turn::h739492967b68b3fb","symbolLocation":208,"imageIndex":0},{"imageOffset":7227252,"symbol":"tokio::runtime::io::driver::Driver::park::h3e5da56850b05b23","symbolLocation":80,"imageIndex":0},{"imageOffset":7325840,"symbol":"tokio::runtime::driver::IoStack::park::h73bc8722b8424662","symbolLocation":104,"imageIndex":0},{"imageOffset":7494740,"symbol":"tokio::runtime::time::Driver::park_internal::hf58ea7c80f4c45a5","symbolLocation":440,"imageIndex":0},{"imageOffset":7495812,"symbol":"tokio::runtime::time::Driver::park::h1e8466de40a285ec","symbolLocation":40,"imageIndex":0},{"imageOffset":7323020,"symbol":"tokio::runtime::driver::TimeDriver::park::h9ee260b7f9a1620e","symbolLocation":96,"imageIndex":0},{"imageOffset":7325284,"symbol":"tokio::runtime::driver::Driver::park::h5d19c93a9d961d59","symbolLocation":32,"imageIndex":0},{"imageOffset":7474164,"symbol":"tokio::runtime::scheduler::multi_thread::park::Inner::park_driver::h663a0be2d9ee6b9b","symbolLocation":120,"imageIndex":0},{"imageOffset":7475684,"symbol":"tokio::runtime::scheduler::multi_thread::park::Inner::park::hfae572ffdf0d9542","symbolLocation":216,"imageIndex":0},{"imageOffset":7476784,"symbol":"tokio::runtime::scheduler::multi_thread::park::Parker::park::h132c6531240678ca","symbolLocation":40,"imageIndex":0},{"imageOffset":7253096,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::park_timeout::h6bae045ee750534d","symbolLocation":776,"imageIndex":0},{"imageOffset":7257248,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::park::h6fd8386b0438fbea","symbolLocation":968,"imageIndex":0},{"imageOffset":7255888,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::run::h012098ccf004c898","symbolLocation":1784,"imageIndex":0},{"imageOffset":7244004,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::hec8d0468f2bbe1b0","symbolLocation":104,"imageIndex":0},{"imageOffset":7360624,"symbol":"tokio::runtime::context::scoped::Scoped$LT$T$GT$::set::h8f4f207fb40043e4","symbolLocation":148,"imageIndex":0},{"imageOffset":7217016,"symbol":"tokio::runtime::context::set_scheduler::_$u7b$$u7b$closure$u7d$$u7d$::haf296180a9797e69","symbolLocation":40,"imageIndex":0},{"imageOffset":7292120,"symbol":"std::thread::local::LocalKey$LT$T$GT$::try_with::h791afc483119bd2b","symbolLocation":196,"imageIndex":0},{"imageOffset":7289516,"symbol":"std::thread::local::LocalKey$LT$T$GT$::with::h89f6a807cad2f1e3","symbolLocation":24,"imageIndex":0},{"imageOffset":7216900,"symbol":"tokio::runtime::context::set_scheduler::h7abe772a78d054ec","symbolLocation":68,"imageIndex":0},{"imageOffset":7243784,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::h05facbe76a4f0ead","symbolLocation":248,"imageIndex":0},{"imageOffset":7362032,"symbol":"tokio::runtime::context::runtime::enter_runtime::hf2ae95d5c661367a","symbolLocation":188,"imageIndex":0},{"imageOffset":7243440,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::hec7adbb00e77e548","symbolLocation":600,"imageIndex":0},{"imageOffset":7248008,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Launch::launch::_$u7b$$u7b$closure$u7d$$u7d$::hf7c5c2c067f21715","symbolLocation":24,"imageIndex":0},{"imageOffset":7502472,"symbol":"_$LT$tokio..runtime..blocking..task..BlockingTask$LT$T$GT$$u20$as$u20$core..future..future..Future$GT$::poll::h301eb4f01c177b57","symbolLocation":136,"imageIndex":0},{"imageOffset":7545944,"symbol":"tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::_$u7b$$u7b$closure$u7d$$u7d$::h11b6b3f2bd5493eb","symbolLocation":192,"imageIndex":0},{"imageOffset":7545360,"symbol":"tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::h15034e48b9b41ff3","symbolLocation":72,"imageIndex":0},{"imageOffset":7467856,"symbol":"tokio::runtime::task::harness::poll_future::_$u7b$$u7b$closure$u7d$$u7d$::h579c3638846ffa27","symbolLocation":64,"imageIndex":0},{"imageOffset":7515892,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hbc653bab54913889","symbolLocation":44,"imageIndex":0},{"imageOffset":7449828,"symbol":"std::panicking::catch_unwind::do_call::hdc7008e0f0436520","symbolLocation":72,"imageIndex":0},{"imageOffset":7288248,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7269904,"symbol":"std::panic::catch_unwind::h6cb1d6d821f2392e","symbolLocation":96,"imageIndex":0},{"imageOffset":7466724,"symbol":"tokio::runtime::task::harness::poll_future::hadce4168d4e011fe","symbolLocation":96,"imageIndex":0},{"imageOffset":7469072,"symbol":"tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll_inner::h33e5930872acf673","symbolLocation":160,"imageIndex":0},{"imageOffset":7470844,"symbol":"tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll::h6bb0b3451b818ad8","symbolLocation":28,"imageIndex":0},{"imageOffset":7320180,"symbol":"tokio::runtime::task::raw::poll::hd2f2553821cd57d7","symbolLocation":36,"imageIndex":0},{"imageOffset":7321460,"symbol":"tokio::runtime::task::raw::RawTask::poll::h7288203f493b28e0","symbolLocation":52,"imageIndex":0},{"imageOffset":7433316,"symbol":"tokio::runtime::task::UnownedTask$LT$S$GT$::run::hf48fa3ac637b65ee","symbolLocation":64,"imageIndex":0},{"imageOffset":7438508,"symbol":"tokio::runtime::blocking::pool::Task::run::h9767d25d6b73c599","symbolLocation":28,"imageIndex":0},{"imageOffset":7439056,"symbol":"tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a","symbolLocation":536,"imageIndex":0},{"imageOffset":7442872,"symbol":"tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d","symbolLocation":144,"imageIndex":0},{"imageOffset":7310312,"symbol":"std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8","symbolLocation":16,"imageIndex":0},{"imageOffset":7403704,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34","symbolLocation":116,"imageIndex":0},{"imageOffset":7516004,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e","symbolLocation":44,"imageIndex":0},{"imageOffset":7449324,"symbol":"std::panicking::catch_unwind::do_call::h5a186a60818a092e","symbolLocation":68,"imageIndex":0},{"imageOffset":7417468,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7402508,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17","symbolLocation":728,"imageIndex":0},{"imageOffset":7188436,"symbol":"core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39","symbolLocation":24,"imageIndex":0},{"imageOffset":10331396,"symbol":"std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004","symbolLocation":60,"imageIndex":0},{"imageOffset":27592,"symbol":"_pthread_start","symbolLocation":136,"imageIndex":5},{"imageOffset":7040,"symbol":"thread_start","symbolLocation":8,"imageIndex":5}]},{"id":7131874,"name":"tokio-runtime-worker","threadState":{"x":[{"value":260},{"value":0},{"value":0},{"value":0},{"value":0},{"value":160},{"value":0},{"value":0},{"value":6102765992},{"value":0},{"value":0},{"value":2},{"value":2},{"value":0},{"value":0},{"value":0},{"value":305},{"value":8716440832},{"value":0},{"value":5549468304},{"value":5549468368},{"value":6102773984},{"value":0},{"value":0},{"value":0},{"value":1},{"value":256},{"value":0},{"value":0}],"flavor":"ARM_THREAD_STATE64","lr":{"value":6854262940},"cpsr":{"value":1610616832},"fp":{"value":6102766112},"sp":{"value":6102765968},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6854005708},"far":{"value":0}},"frames":[{"imageOffset":17356,"symbol":"__psynch_cvwait","symbolLocation":8,"imageIndex":4},{"imageOffset":28828,"symbol":"_pthread_cond_wait","symbolLocation":984,"imageIndex":5},{"imageOffset":7516820,"symbol":"std::sys::sync::condvar::pthread::Condvar::wait::h831fd128ae8335c8","symbolLocation":184,"imageIndex":0},{"imageOffset":7503660,"symbol":"std::sync::poison::condvar::Condvar::wait::haa84796d4cc5b740","symbolLocation":56,"imageIndex":0},{"imageOffset":7474796,"symbol":"tokio::runtime::scheduler::multi_thread::park::Inner::park_condvar::hb412d549192a77c4","symbolLocation":284,"imageIndex":0},{"imageOffset":7475636,"symbol":"tokio::runtime::scheduler::multi_thread::park::Inner::park::hfae572ffdf0d9542","symbolLocation":168,"imageIndex":0},{"imageOffset":7476784,"symbol":"tokio::runtime::scheduler::multi_thread::park::Parker::park::h132c6531240678ca","symbolLocation":40,"imageIndex":0},{"imageOffset":7253096,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::park_timeout::h6bae045ee750534d","symbolLocation":776,"imageIndex":0},{"imageOffset":7257248,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::park::h6fd8386b0438fbea","symbolLocation":968,"imageIndex":0},{"imageOffset":7255888,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::run::h012098ccf004c898","symbolLocation":1784,"imageIndex":0},{"imageOffset":7244004,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::hec8d0468f2bbe1b0","symbolLocation":104,"imageIndex":0},{"imageOffset":7360624,"symbol":"tokio::runtime::context::scoped::Scoped$LT$T$GT$::set::h8f4f207fb40043e4","symbolLocation":148,"imageIndex":0},{"imageOffset":7217016,"symbol":"tokio::runtime::context::set_scheduler::_$u7b$$u7b$closure$u7d$$u7d$::haf296180a9797e69","symbolLocation":40,"imageIndex":0},{"imageOffset":7292120,"symbol":"std::thread::local::LocalKey$LT$T$GT$::try_with::h791afc483119bd2b","symbolLocation":196,"imageIndex":0},{"imageOffset":7289516,"symbol":"std::thread::local::LocalKey$LT$T$GT$::with::h89f6a807cad2f1e3","symbolLocation":24,"imageIndex":0},{"imageOffset":7216900,"symbol":"tokio::runtime::context::set_scheduler::h7abe772a78d054ec","symbolLocation":68,"imageIndex":0},{"imageOffset":7243784,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::h05facbe76a4f0ead","symbolLocation":248,"imageIndex":0},{"imageOffset":7362032,"symbol":"tokio::runtime::context::runtime::enter_runtime::hf2ae95d5c661367a","symbolLocation":188,"imageIndex":0},{"imageOffset":7243440,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::hec7adbb00e77e548","symbolLocation":600,"imageIndex":0},{"imageOffset":7248008,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Launch::launch::_$u7b$$u7b$closure$u7d$$u7d$::hf7c5c2c067f21715","symbolLocation":24,"imageIndex":0},{"imageOffset":7502472,"symbol":"_$LT$tokio..runtime..blocking..task..BlockingTask$LT$T$GT$$u20$as$u20$core..future..future..Future$GT$::poll::h301eb4f01c177b57","symbolLocation":136,"imageIndex":0},{"imageOffset":7545944,"symbol":"tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::_$u7b$$u7b$closure$u7d$$u7d$::h11b6b3f2bd5493eb","symbolLocation":192,"imageIndex":0},{"imageOffset":7545360,"symbol":"tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::h15034e48b9b41ff3","symbolLocation":72,"imageIndex":0},{"imageOffset":7467856,"symbol":"tokio::runtime::task::harness::poll_future::_$u7b$$u7b$closure$u7d$$u7d$::h579c3638846ffa27","symbolLocation":64,"imageIndex":0},{"imageOffset":7515892,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hbc653bab54913889","symbolLocation":44,"imageIndex":0},{"imageOffset":7449828,"symbol":"std::panicking::catch_unwind::do_call::hdc7008e0f0436520","symbolLocation":72,"imageIndex":0},{"imageOffset":7288248,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7269904,"symbol":"std::panic::catch_unwind::h6cb1d6d821f2392e","symbolLocation":96,"imageIndex":0},{"imageOffset":7466724,"symbol":"tokio::runtime::task::harness::poll_future::hadce4168d4e011fe","symbolLocation":96,"imageIndex":0},{"imageOffset":7469072,"symbol":"tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll_inner::h33e5930872acf673","symbolLocation":160,"imageIndex":0},{"imageOffset":7470844,"symbol":"tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll::h6bb0b3451b818ad8","symbolLocation":28,"imageIndex":0},{"imageOffset":7320180,"symbol":"tokio::runtime::task::raw::poll::hd2f2553821cd57d7","symbolLocation":36,"imageIndex":0},{"imageOffset":7321460,"symbol":"tokio::runtime::task::raw::RawTask::poll::h7288203f493b28e0","symbolLocation":52,"imageIndex":0},{"imageOffset":7433316,"symbol":"tokio::runtime::task::UnownedTask$LT$S$GT$::run::hf48fa3ac637b65ee","symbolLocation":64,"imageIndex":0},{"imageOffset":7438508,"symbol":"tokio::runtime::blocking::pool::Task::run::h9767d25d6b73c599","symbolLocation":28,"imageIndex":0},{"imageOffset":7439056,"symbol":"tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a","symbolLocation":536,"imageIndex":0},{"imageOffset":7442872,"symbol":"tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d","symbolLocation":144,"imageIndex":0},{"imageOffset":7310312,"symbol":"std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8","symbolLocation":16,"imageIndex":0},{"imageOffset":7403704,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34","symbolLocation":116,"imageIndex":0},{"imageOffset":7516004,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e","symbolLocation":44,"imageIndex":0},{"imageOffset":7449324,"symbol":"std::panicking::catch_unwind::do_call::h5a186a60818a092e","symbolLocation":68,"imageIndex":0},{"imageOffset":7417468,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7402508,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17","symbolLocation":728,"imageIndex":0},{"imageOffset":7188436,"symbol":"core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39","symbolLocation":24,"imageIndex":0},{"imageOffset":10331396,"symbol":"std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004","symbolLocation":60,"imageIndex":0},{"imageOffset":27592,"symbol":"_pthread_start","symbolLocation":136,"imageIndex":5},{"imageOffset":7040,"symbol":"thread_start","symbolLocation":8,"imageIndex":5}]},{"id":7131875,"name":"tokio-runtime-worker","threadState":{"x":[{"value":260},{"value":0},{"value":17408},{"value":0},{"value":0},{"value":160},{"value":0},{"value":0},{"value":6104912296},{"value":0},{"value":0},{"value":2},{"value":2},{"value":0},{"value":0},{"value":0},{"value":305},{"value":8716440832},{"value":0},{"value":5547430768},{"value":5547425712},{"value":6104920288},{"value":0},{"value":0},{"value":17408},{"value":17409},{"value":17664},{"value":0},{"value":0}],"flavor":"ARM_THREAD_STATE64","lr":{"value":6854262940},"cpsr":{"value":1610616832},"fp":{"value":6104912416},"sp":{"value":6104912272},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6854005708},"far":{"value":0}},"frames":[{"imageOffset":17356,"symbol":"__psynch_cvwait","symbolLocation":8,"imageIndex":4},{"imageOffset":28828,"symbol":"_pthread_cond_wait","symbolLocation":984,"imageIndex":5},{"imageOffset":7516820,"symbol":"std::sys::sync::condvar::pthread::Condvar::wait::h831fd128ae8335c8","symbolLocation":184,"imageIndex":0},{"imageOffset":7503660,"symbol":"std::sync::poison::condvar::Condvar::wait::haa84796d4cc5b740","symbolLocation":56,"imageIndex":0},{"imageOffset":7474796,"symbol":"tokio::runtime::scheduler::multi_thread::park::Inner::park_condvar::hb412d549192a77c4","symbolLocation":284,"imageIndex":0},{"imageOffset":7475636,"symbol":"tokio::runtime::scheduler::multi_thread::park::Inner::park::hfae572ffdf0d9542","symbolLocation":168,"imageIndex":0},{"imageOffset":7476784,"symbol":"tokio::runtime::scheduler::multi_thread::park::Parker::park::h132c6531240678ca","symbolLocation":40,"imageIndex":0},{"imageOffset":7253096,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::park_timeout::h6bae045ee750534d","symbolLocation":776,"imageIndex":0},{"imageOffset":7257248,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::park::h6fd8386b0438fbea","symbolLocation":968,"imageIndex":0},{"imageOffset":7255888,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::run::h012098ccf004c898","symbolLocation":1784,"imageIndex":0},{"imageOffset":7244004,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::hec8d0468f2bbe1b0","symbolLocation":104,"imageIndex":0},{"imageOffset":7360624,"symbol":"tokio::runtime::context::scoped::Scoped$LT$T$GT$::set::h8f4f207fb40043e4","symbolLocation":148,"imageIndex":0},{"imageOffset":7217016,"symbol":"tokio::runtime::context::set_scheduler::_$u7b$$u7b$closure$u7d$$u7d$::haf296180a9797e69","symbolLocation":40,"imageIndex":0},{"imageOffset":7292120,"symbol":"std::thread::local::LocalKey$LT$T$GT$::try_with::h791afc483119bd2b","symbolLocation":196,"imageIndex":0},{"imageOffset":7289516,"symbol":"std::thread::local::LocalKey$LT$T$GT$::with::h89f6a807cad2f1e3","symbolLocation":24,"imageIndex":0},{"imageOffset":7216900,"symbol":"tokio::runtime::context::set_scheduler::h7abe772a78d054ec","symbolLocation":68,"imageIndex":0},{"imageOffset":7243784,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::h05facbe76a4f0ead","symbolLocation":248,"imageIndex":0},{"imageOffset":7362032,"symbol":"tokio::runtime::context::runtime::enter_runtime::hf2ae95d5c661367a","symbolLocation":188,"imageIndex":0},{"imageOffset":7243440,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::hec7adbb00e77e548","symbolLocation":600,"imageIndex":0},{"imageOffset":7248008,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Launch::launch::_$u7b$$u7b$closure$u7d$$u7d$::hf7c5c2c067f21715","symbolLocation":24,"imageIndex":0},{"imageOffset":7502472,"symbol":"_$LT$tokio..runtime..blocking..task..BlockingTask$LT$T$GT$$u20$as$u20$core..future..future..Future$GT$::poll::h301eb4f01c177b57","symbolLocation":136,"imageIndex":0},{"imageOffset":7545944,"symbol":"tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::_$u7b$$u7b$closure$u7d$$u7d$::h11b6b3f2bd5493eb","symbolLocation":192,"imageIndex":0},{"imageOffset":7545360,"symbol":"tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::h15034e48b9b41ff3","symbolLocation":72,"imageIndex":0},{"imageOffset":7467856,"symbol":"tokio::runtime::task::harness::poll_future::_$u7b$$u7b$closure$u7d$$u7d$::h579c3638846ffa27","symbolLocation":64,"imageIndex":0},{"imageOffset":7515892,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hbc653bab54913889","symbolLocation":44,"imageIndex":0},{"imageOffset":7449828,"symbol":"std::panicking::catch_unwind::do_call::hdc7008e0f0436520","symbolLocation":72,"imageIndex":0},{"imageOffset":7288248,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7269904,"symbol":"std::panic::catch_unwind::h6cb1d6d821f2392e","symbolLocation":96,"imageIndex":0},{"imageOffset":7466724,"symbol":"tokio::runtime::task::harness::poll_future::hadce4168d4e011fe","symbolLocation":96,"imageIndex":0},{"imageOffset":7469072,"symbol":"tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll_inner::h33e5930872acf673","symbolLocation":160,"imageIndex":0},{"imageOffset":7470844,"symbol":"tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll::h6bb0b3451b818ad8","symbolLocation":28,"imageIndex":0},{"imageOffset":7320180,"symbol":"tokio::runtime::task::raw::poll::hd2f2553821cd57d7","symbolLocation":36,"imageIndex":0},{"imageOffset":7321460,"symbol":"tokio::runtime::task::raw::RawTask::poll::h7288203f493b28e0","symbolLocation":52,"imageIndex":0},{"imageOffset":7433316,"symbol":"tokio::runtime::task::UnownedTask$LT$S$GT$::run::hf48fa3ac637b65ee","symbolLocation":64,"imageIndex":0},{"imageOffset":7438508,"symbol":"tokio::runtime::blocking::pool::Task::run::h9767d25d6b73c599","symbolLocation":28,"imageIndex":0},{"imageOffset":7439056,"symbol":"tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a","symbolLocation":536,"imageIndex":0},{"imageOffset":7442872,"symbol":"tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d","symbolLocation":144,"imageIndex":0},{"imageOffset":7310312,"symbol":"std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8","symbolLocation":16,"imageIndex":0},{"imageOffset":7403704,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34","symbolLocation":116,"imageIndex":0},{"imageOffset":7516004,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e","symbolLocation":44,"imageIndex":0},{"imageOffset":7449324,"symbol":"std::panicking::catch_unwind::do_call::h5a186a60818a092e","symbolLocation":68,"imageIndex":0},{"imageOffset":7417468,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7402508,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17","symbolLocation":728,"imageIndex":0},{"imageOffset":7188436,"symbol":"core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39","symbolLocation":24,"imageIndex":0},{"imageOffset":10331396,"symbol":"std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004","symbolLocation":60,"imageIndex":0},{"imageOffset":27592,"symbol":"_pthread_start","symbolLocation":136,"imageIndex":5},{"imageOffset":7040,"symbol":"thread_start","symbolLocation":8,"imageIndex":5}]},{"id":7131876,"name":"tokio-runtime-worker","threadState":{"x":[{"value":260},{"value":0},{"value":0},{"value":0},{"value":0},{"value":160},{"value":0},{"value":0},{"value":6107058600},{"value":0},{"value":0},{"value":2},{"value":2},{"value":0},{"value":0},{"value":0},{"value":305},{"value":8716440832},{"value":0},{"value":5549469936},{"value":5549470000},{"value":6107066592},{"value":0},{"value":0},{"value":0},{"value":1},{"value":256},{"value":0},{"value":0}],"flavor":"ARM_THREAD_STATE64","lr":{"value":6854262940},"cpsr":{"value":1610616832},"fp":{"value":6107058720},"sp":{"value":6107058576},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6854005708},"far":{"value":0}},"frames":[{"imageOffset":17356,"symbol":"__psynch_cvwait","symbolLocation":8,"imageIndex":4},{"imageOffset":28828,"symbol":"_pthread_cond_wait","symbolLocation":984,"imageIndex":5},{"imageOffset":7516820,"symbol":"std::sys::sync::condvar::pthread::Condvar::wait::h831fd128ae8335c8","symbolLocation":184,"imageIndex":0},{"imageOffset":7503660,"symbol":"std::sync::poison::condvar::Condvar::wait::haa84796d4cc5b740","symbolLocation":56,"imageIndex":0},{"imageOffset":7474796,"symbol":"tokio::runtime::scheduler::multi_thread::park::Inner::park_condvar::hb412d549192a77c4","symbolLocation":284,"imageIndex":0},{"imageOffset":7475636,"symbol":"tokio::runtime::scheduler::multi_thread::park::Inner::park::hfae572ffdf0d9542","symbolLocation":168,"imageIndex":0},{"imageOffset":7476784,"symbol":"tokio::runtime::scheduler::multi_thread::park::Parker::park::h132c6531240678ca","symbolLocation":40,"imageIndex":0},{"imageOffset":7253096,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::park_timeout::h6bae045ee750534d","symbolLocation":776,"imageIndex":0},{"imageOffset":7257248,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::park::h6fd8386b0438fbea","symbolLocation":968,"imageIndex":0},{"imageOffset":7255888,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::run::h012098ccf004c898","symbolLocation":1784,"imageIndex":0},{"imageOffset":7244004,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::hec8d0468f2bbe1b0","symbolLocation":104,"imageIndex":0},{"imageOffset":7360624,"symbol":"tokio::runtime::context::scoped::Scoped$LT$T$GT$::set::h8f4f207fb40043e4","symbolLocation":148,"imageIndex":0},{"imageOffset":7217016,"symbol":"tokio::runtime::context::set_scheduler::_$u7b$$u7b$closure$u7d$$u7d$::haf296180a9797e69","symbolLocation":40,"imageIndex":0},{"imageOffset":7292120,"symbol":"std::thread::local::LocalKey$LT$T$GT$::try_with::h791afc483119bd2b","symbolLocation":196,"imageIndex":0},{"imageOffset":7289516,"symbol":"std::thread::local::LocalKey$LT$T$GT$::with::h89f6a807cad2f1e3","symbolLocation":24,"imageIndex":0},{"imageOffset":7216900,"symbol":"tokio::runtime::context::set_scheduler::h7abe772a78d054ec","symbolLocation":68,"imageIndex":0},{"imageOffset":7243784,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::h05facbe76a4f0ead","symbolLocation":248,"imageIndex":0},{"imageOffset":7362032,"symbol":"tokio::runtime::context::runtime::enter_runtime::hf2ae95d5c661367a","symbolLocation":188,"imageIndex":0},{"imageOffset":7243440,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::hec7adbb00e77e548","symbolLocation":600,"imageIndex":0},{"imageOffset":7248008,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Launch::launch::_$u7b$$u7b$closure$u7d$$u7d$::hf7c5c2c067f21715","symbolLocation":24,"imageIndex":0},{"imageOffset":7502472,"symbol":"_$LT$tokio..runtime..blocking..task..BlockingTask$LT$T$GT$$u20$as$u20$core..future..future..Future$GT$::poll::h301eb4f01c177b57","symbolLocation":136,"imageIndex":0},{"imageOffset":7545944,"symbol":"tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::_$u7b$$u7b$closure$u7d$$u7d$::h11b6b3f2bd5493eb","symbolLocation":192,"imageIndex":0},{"imageOffset":7545360,"symbol":"tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::h15034e48b9b41ff3","symbolLocation":72,"imageIndex":0},{"imageOffset":7467856,"symbol":"tokio::runtime::task::harness::poll_future::_$u7b$$u7b$closure$u7d$$u7d$::h579c3638846ffa27","symbolLocation":64,"imageIndex":0},{"imageOffset":7515892,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hbc653bab54913889","symbolLocation":44,"imageIndex":0},{"imageOffset":7449828,"symbol":"std::panicking::catch_unwind::do_call::hdc7008e0f0436520","symbolLocation":72,"imageIndex":0},{"imageOffset":7288248,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7269904,"symbol":"std::panic::catch_unwind::h6cb1d6d821f2392e","symbolLocation":96,"imageIndex":0},{"imageOffset":7466724,"symbol":"tokio::runtime::task::harness::poll_future::hadce4168d4e011fe","symbolLocation":96,"imageIndex":0},{"imageOffset":7469072,"symbol":"tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll_inner::h33e5930872acf673","symbolLocation":160,"imageIndex":0},{"imageOffset":7470844,"symbol":"tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll::h6bb0b3451b818ad8","symbolLocation":28,"imageIndex":0},{"imageOffset":7320180,"symbol":"tokio::runtime::task::raw::poll::hd2f2553821cd57d7","symbolLocation":36,"imageIndex":0},{"imageOffset":7321460,"symbol":"tokio::runtime::task::raw::RawTask::poll::h7288203f493b28e0","symbolLocation":52,"imageIndex":0},{"imageOffset":7433316,"symbol":"tokio::runtime::task::UnownedTask$LT$S$GT$::run::hf48fa3ac637b65ee","symbolLocation":64,"imageIndex":0},{"imageOffset":7438508,"symbol":"tokio::runtime::blocking::pool::Task::run::h9767d25d6b73c599","symbolLocation":28,"imageIndex":0},{"imageOffset":7439056,"symbol":"tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a","symbolLocation":536,"imageIndex":0},{"imageOffset":7442872,"symbol":"tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d","symbolLocation":144,"imageIndex":0},{"imageOffset":7310312,"symbol":"std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8","symbolLocation":16,"imageIndex":0},{"imageOffset":7403704,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34","symbolLocation":116,"imageIndex":0},{"imageOffset":7516004,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e","symbolLocation":44,"imageIndex":0},{"imageOffset":7449324,"symbol":"std::panicking::catch_unwind::do_call::h5a186a60818a092e","symbolLocation":68,"imageIndex":0},{"imageOffset":7417468,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7402508,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17","symbolLocation":728,"imageIndex":0},{"imageOffset":7188436,"symbol":"core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39","symbolLocation":24,"imageIndex":0},{"imageOffset":10331396,"symbol":"std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004","symbolLocation":60,"imageIndex":0},{"imageOffset":27592,"symbol":"_pthread_start","symbolLocation":136,"imageIndex":5},{"imageOffset":7040,"symbol":"thread_start","symbolLocation":8,"imageIndex":5}]},{"id":7131877,"name":"tokio-runtime-worker","threadState":{"x":[{"value":260},{"value":0},{"value":0},{"value":0},{"value":0},{"value":160},{"value":0},{"value":0},{"value":6109204904},{"value":0},{"value":0},{"value":2},{"value":2},{"value":0},{"value":0},{"value":0},{"value":305},{"value":8716440832},{"value":0},{"value":5549469120},{"value":5549469184},{"value":6109212896},{"value":0},{"value":0},{"value":0},{"value":1},{"value":256},{"value":0},{"value":0}],"flavor":"ARM_THREAD_STATE64","lr":{"value":6854262940},"cpsr":{"value":1610616832},"fp":{"value":6109205024},"sp":{"value":6109204880},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6854005708},"far":{"value":0}},"frames":[{"imageOffset":17356,"symbol":"__psynch_cvwait","symbolLocation":8,"imageIndex":4},{"imageOffset":28828,"symbol":"_pthread_cond_wait","symbolLocation":984,"imageIndex":5},{"imageOffset":7516820,"symbol":"std::sys::sync::condvar::pthread::Condvar::wait::h831fd128ae8335c8","symbolLocation":184,"imageIndex":0},{"imageOffset":7503660,"symbol":"std::sync::poison::condvar::Condvar::wait::haa84796d4cc5b740","symbolLocation":56,"imageIndex":0},{"imageOffset":7474796,"symbol":"tokio::runtime::scheduler::multi_thread::park::Inner::park_condvar::hb412d549192a77c4","symbolLocation":284,"imageIndex":0},{"imageOffset":7475636,"symbol":"tokio::runtime::scheduler::multi_thread::park::Inner::park::hfae572ffdf0d9542","symbolLocation":168,"imageIndex":0},{"imageOffset":7476784,"symbol":"tokio::runtime::scheduler::multi_thread::park::Parker::park::h132c6531240678ca","symbolLocation":40,"imageIndex":0},{"imageOffset":7253096,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::park_timeout::h6bae045ee750534d","symbolLocation":776,"imageIndex":0},{"imageOffset":7257248,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::park::h6fd8386b0438fbea","symbolLocation":968,"imageIndex":0},{"imageOffset":7255888,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::run::h012098ccf004c898","symbolLocation":1784,"imageIndex":0},{"imageOffset":7244004,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::hec8d0468f2bbe1b0","symbolLocation":104,"imageIndex":0},{"imageOffset":7360624,"symbol":"tokio::runtime::context::scoped::Scoped$LT$T$GT$::set::h8f4f207fb40043e4","symbolLocation":148,"imageIndex":0},{"imageOffset":7217016,"symbol":"tokio::runtime::context::set_scheduler::_$u7b$$u7b$closure$u7d$$u7d$::haf296180a9797e69","symbolLocation":40,"imageIndex":0},{"imageOffset":7292120,"symbol":"std::thread::local::LocalKey$LT$T$GT$::try_with::h791afc483119bd2b","symbolLocation":196,"imageIndex":0},{"imageOffset":7289516,"symbol":"std::thread::local::LocalKey$LT$T$GT$::with::h89f6a807cad2f1e3","symbolLocation":24,"imageIndex":0},{"imageOffset":7216900,"symbol":"tokio::runtime::context::set_scheduler::h7abe772a78d054ec","symbolLocation":68,"imageIndex":0},{"imageOffset":7243784,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::h05facbe76a4f0ead","symbolLocation":248,"imageIndex":0},{"imageOffset":7362032,"symbol":"tokio::runtime::context::runtime::enter_runtime::hf2ae95d5c661367a","symbolLocation":188,"imageIndex":0},{"imageOffset":7243440,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::hec7adbb00e77e548","symbolLocation":600,"imageIndex":0},{"imageOffset":7248008,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Launch::launch::_$u7b$$u7b$closure$u7d$$u7d$::hf7c5c2c067f21715","symbolLocation":24,"imageIndex":0},{"imageOffset":7502472,"symbol":"_$LT$tokio..runtime..blocking..task..BlockingTask$LT$T$GT$$u20$as$u20$core..future..future..Future$GT$::poll::h301eb4f01c177b57","symbolLocation":136,"imageIndex":0},{"imageOffset":7545944,"symbol":"tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::_$u7b$$u7b$closure$u7d$$u7d$::h11b6b3f2bd5493eb","symbolLocation":192,"imageIndex":0},{"imageOffset":7545360,"symbol":"tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::h15034e48b9b41ff3","symbolLocation":72,"imageIndex":0},{"imageOffset":7467856,"symbol":"tokio::runtime::task::harness::poll_future::_$u7b$$u7b$closure$u7d$$u7d$::h579c3638846ffa27","symbolLocation":64,"imageIndex":0},{"imageOffset":7515892,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hbc653bab54913889","symbolLocation":44,"imageIndex":0},{"imageOffset":7449828,"symbol":"std::panicking::catch_unwind::do_call::hdc7008e0f0436520","symbolLocation":72,"imageIndex":0},{"imageOffset":7288248,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7269904,"symbol":"std::panic::catch_unwind::h6cb1d6d821f2392e","symbolLocation":96,"imageIndex":0},{"imageOffset":7466724,"symbol":"tokio::runtime::task::harness::poll_future::hadce4168d4e011fe","symbolLocation":96,"imageIndex":0},{"imageOffset":7469072,"symbol":"tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll_inner::h33e5930872acf673","symbolLocation":160,"imageIndex":0},{"imageOffset":7470844,"symbol":"tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll::h6bb0b3451b818ad8","symbolLocation":28,"imageIndex":0},{"imageOffset":7320180,"symbol":"tokio::runtime::task::raw::poll::hd2f2553821cd57d7","symbolLocation":36,"imageIndex":0},{"imageOffset":7321460,"symbol":"tokio::runtime::task::raw::RawTask::poll::h7288203f493b28e0","symbolLocation":52,"imageIndex":0},{"imageOffset":7433316,"symbol":"tokio::runtime::task::UnownedTask$LT$S$GT$::run::hf48fa3ac637b65ee","symbolLocation":64,"imageIndex":0},{"imageOffset":7438508,"symbol":"tokio::runtime::blocking::pool::Task::run::h9767d25d6b73c599","symbolLocation":28,"imageIndex":0},{"imageOffset":7439056,"symbol":"tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a","symbolLocation":536,"imageIndex":0},{"imageOffset":7442872,"symbol":"tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d","symbolLocation":144,"imageIndex":0},{"imageOffset":7310312,"symbol":"std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8","symbolLocation":16,"imageIndex":0},{"imageOffset":7403704,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34","symbolLocation":116,"imageIndex":0},{"imageOffset":7516004,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e","symbolLocation":44,"imageIndex":0},{"imageOffset":7449324,"symbol":"std::panicking::catch_unwind::do_call::h5a186a60818a092e","symbolLocation":68,"imageIndex":0},{"imageOffset":7417468,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7402508,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17","symbolLocation":728,"imageIndex":0},{"imageOffset":7188436,"symbol":"core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39","symbolLocation":24,"imageIndex":0},{"imageOffset":10331396,"symbol":"std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004","symbolLocation":60,"imageIndex":0},{"imageOffset":27592,"symbol":"_pthread_start","symbolLocation":136,"imageIndex":5},{"imageOffset":7040,"symbol":"thread_start","symbolLocation":8,"imageIndex":5}]},{"id":7131878,"name":"tokio-runtime-worker","threadState":{"x":[{"value":260},{"value":0},{"value":156160},{"value":0},{"value":0},{"value":160},{"value":0},{"value":0},{"value":6111351208},{"value":0},{"value":256},{"value":1099511628034},{"value":1099511628034},{"value":256},{"value":0},{"value":1099511628032},{"value":305},{"value":8716440832},{"value":0},{"value":5549470752},{"value":5549470816},{"value":6111359200},{"value":0},{"value":0},{"value":156160},{"value":156161},{"value":156416},{"value":0},{"value":0}],"flavor":"ARM_THREAD_STATE64","lr":{"value":6854262940},"cpsr":{"value":1610616832},"fp":{"value":6111351328},"sp":{"value":6111351184},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6854005708},"far":{"value":0}},"frames":[{"imageOffset":17356,"symbol":"__psynch_cvwait","symbolLocation":8,"imageIndex":4},{"imageOffset":28828,"symbol":"_pthread_cond_wait","symbolLocation":984,"imageIndex":5},{"imageOffset":7516820,"symbol":"std::sys::sync::condvar::pthread::Condvar::wait::h831fd128ae8335c8","symbolLocation":184,"imageIndex":0},{"imageOffset":7503660,"symbol":"std::sync::poison::condvar::Condvar::wait::haa84796d4cc5b740","symbolLocation":56,"imageIndex":0},{"imageOffset":7474796,"symbol":"tokio::runtime::scheduler::multi_thread::park::Inner::park_condvar::hb412d549192a77c4","symbolLocation":284,"imageIndex":0},{"imageOffset":7475636,"symbol":"tokio::runtime::scheduler::multi_thread::park::Inner::park::hfae572ffdf0d9542","symbolLocation":168,"imageIndex":0},{"imageOffset":7476784,"symbol":"tokio::runtime::scheduler::multi_thread::park::Parker::park::h132c6531240678ca","symbolLocation":40,"imageIndex":0},{"imageOffset":7253096,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::park_timeout::h6bae045ee750534d","symbolLocation":776,"imageIndex":0},{"imageOffset":7257248,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::park::h6fd8386b0438fbea","symbolLocation":968,"imageIndex":0},{"imageOffset":7255888,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::run::h012098ccf004c898","symbolLocation":1784,"imageIndex":0},{"imageOffset":7244004,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::hec8d0468f2bbe1b0","symbolLocation":104,"imageIndex":0},{"imageOffset":7360624,"symbol":"tokio::runtime::context::scoped::Scoped$LT$T$GT$::set::h8f4f207fb40043e4","symbolLocation":148,"imageIndex":0},{"imageOffset":7217016,"symbol":"tokio::runtime::context::set_scheduler::_$u7b$$u7b$closure$u7d$$u7d$::haf296180a9797e69","symbolLocation":40,"imageIndex":0},{"imageOffset":7292120,"symbol":"std::thread::local::LocalKey$LT$T$GT$::try_with::h791afc483119bd2b","symbolLocation":196,"imageIndex":0},{"imageOffset":7289516,"symbol":"std::thread::local::LocalKey$LT$T$GT$::with::h89f6a807cad2f1e3","symbolLocation":24,"imageIndex":0},{"imageOffset":7216900,"symbol":"tokio::runtime::context::set_scheduler::h7abe772a78d054ec","symbolLocation":68,"imageIndex":0},{"imageOffset":7243784,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::h05facbe76a4f0ead","symbolLocation":248,"imageIndex":0},{"imageOffset":7362032,"symbol":"tokio::runtime::context::runtime::enter_runtime::hf2ae95d5c661367a","symbolLocation":188,"imageIndex":0},{"imageOffset":7243440,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::hec7adbb00e77e548","symbolLocation":600,"imageIndex":0},{"imageOffset":7248008,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Launch::launch::_$u7b$$u7b$closure$u7d$$u7d$::hf7c5c2c067f21715","symbolLocation":24,"imageIndex":0},{"imageOffset":7502472,"symbol":"_$LT$tokio..runtime..blocking..task..BlockingTask$LT$T$GT$$u20$as$u20$core..future..future..Future$GT$::poll::h301eb4f01c177b57","symbolLocation":136,"imageIndex":0},{"imageOffset":7545944,"symbol":"tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::_$u7b$$u7b$closure$u7d$$u7d$::h11b6b3f2bd5493eb","symbolLocation":192,"imageIndex":0},{"imageOffset":7545360,"symbol":"tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::h15034e48b9b41ff3","symbolLocation":72,"imageIndex":0},{"imageOffset":7467856,"symbol":"tokio::runtime::task::harness::poll_future::_$u7b$$u7b$closure$u7d$$u7d$::h579c3638846ffa27","symbolLocation":64,"imageIndex":0},{"imageOffset":7515892,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hbc653bab54913889","symbolLocation":44,"imageIndex":0},{"imageOffset":7449828,"symbol":"std::panicking::catch_unwind::do_call::hdc7008e0f0436520","symbolLocation":72,"imageIndex":0},{"imageOffset":7288248,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7269904,"symbol":"std::panic::catch_unwind::h6cb1d6d821f2392e","symbolLocation":96,"imageIndex":0},{"imageOffset":7466724,"symbol":"tokio::runtime::task::harness::poll_future::hadce4168d4e011fe","symbolLocation":96,"imageIndex":0},{"imageOffset":7469072,"symbol":"tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll_inner::h33e5930872acf673","symbolLocation":160,"imageIndex":0},{"imageOffset":7470844,"symbol":"tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll::h6bb0b3451b818ad8","symbolLocation":28,"imageIndex":0},{"imageOffset":7320180,"symbol":"tokio::runtime::task::raw::poll::hd2f2553821cd57d7","symbolLocation":36,"imageIndex":0},{"imageOffset":7321460,"symbol":"tokio::runtime::task::raw::RawTask::poll::h7288203f493b28e0","symbolLocation":52,"imageIndex":0},{"imageOffset":7433316,"symbol":"tokio::runtime::task::UnownedTask$LT$S$GT$::run::hf48fa3ac637b65ee","symbolLocation":64,"imageIndex":0},{"imageOffset":7438508,"symbol":"tokio::runtime::blocking::pool::Task::run::h9767d25d6b73c599","symbolLocation":28,"imageIndex":0},{"imageOffset":7439056,"symbol":"tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a","symbolLocation":536,"imageIndex":0},{"imageOffset":7442872,"symbol":"tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d","symbolLocation":144,"imageIndex":0},{"imageOffset":7310312,"symbol":"std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8","symbolLocation":16,"imageIndex":0},{"imageOffset":7403704,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34","symbolLocation":116,"imageIndex":0},{"imageOffset":7516004,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e","symbolLocation":44,"imageIndex":0},{"imageOffset":7449324,"symbol":"std::panicking::catch_unwind::do_call::h5a186a60818a092e","symbolLocation":68,"imageIndex":0},{"imageOffset":7417468,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7402508,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17","symbolLocation":728,"imageIndex":0},{"imageOffset":7188436,"symbol":"core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39","symbolLocation":24,"imageIndex":0},{"imageOffset":10331396,"symbol":"std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004","symbolLocation":60,"imageIndex":0},{"imageOffset":27592,"symbol":"_pthread_start","symbolLocation":136,"imageIndex":5},{"imageOffset":7040,"symbol":"thread_start","symbolLocation":8,"imageIndex":5}]},{"id":7131879,"name":"tokio-runtime-worker","threadState":{"x":[{"value":260},{"value":0},{"value":180736},{"value":0},{"value":0},{"value":160},{"value":0},{"value":0},{"value":6113497512},{"value":0},{"value":256},{"value":1099511628034},{"value":1099511628034},{"value":256},{"value":0},{"value":1099511628032},{"value":305},{"value":8716440832},{"value":0},{"value":5549471568},{"value":5549471632},{"value":6113505504},{"value":0},{"value":0},{"value":180736},{"value":180737},{"value":180992},{"value":0},{"value":0}],"flavor":"ARM_THREAD_STATE64","lr":{"value":6854262940},"cpsr":{"value":1610616832},"fp":{"value":6113497632},"sp":{"value":6113497488},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6854005708},"far":{"value":0}},"frames":[{"imageOffset":17356,"symbol":"__psynch_cvwait","symbolLocation":8,"imageIndex":4},{"imageOffset":28828,"symbol":"_pthread_cond_wait","symbolLocation":984,"imageIndex":5},{"imageOffset":7516820,"symbol":"std::sys::sync::condvar::pthread::Condvar::wait::h831fd128ae8335c8","symbolLocation":184,"imageIndex":0},{"imageOffset":7503660,"symbol":"std::sync::poison::condvar::Condvar::wait::haa84796d4cc5b740","symbolLocation":56,"imageIndex":0},{"imageOffset":7474796,"symbol":"tokio::runtime::scheduler::multi_thread::park::Inner::park_condvar::hb412d549192a77c4","symbolLocation":284,"imageIndex":0},{"imageOffset":7475636,"symbol":"tokio::runtime::scheduler::multi_thread::park::Inner::park::hfae572ffdf0d9542","symbolLocation":168,"imageIndex":0},{"imageOffset":7476784,"symbol":"tokio::runtime::scheduler::multi_thread::park::Parker::park::h132c6531240678ca","symbolLocation":40,"imageIndex":0},{"imageOffset":7253096,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::park_timeout::h6bae045ee750534d","symbolLocation":776,"imageIndex":0},{"imageOffset":7257248,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::park::h6fd8386b0438fbea","symbolLocation":968,"imageIndex":0},{"imageOffset":7255888,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::run::h012098ccf004c898","symbolLocation":1784,"imageIndex":0},{"imageOffset":7244004,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::hec8d0468f2bbe1b0","symbolLocation":104,"imageIndex":0},{"imageOffset":7360624,"symbol":"tokio::runtime::context::scoped::Scoped$LT$T$GT$::set::h8f4f207fb40043e4","symbolLocation":148,"imageIndex":0},{"imageOffset":7217016,"symbol":"tokio::runtime::context::set_scheduler::_$u7b$$u7b$closure$u7d$$u7d$::haf296180a9797e69","symbolLocation":40,"imageIndex":0},{"imageOffset":7292120,"symbol":"std::thread::local::LocalKey$LT$T$GT$::try_with::h791afc483119bd2b","symbolLocation":196,"imageIndex":0},{"imageOffset":7289516,"symbol":"std::thread::local::LocalKey$LT$T$GT$::with::h89f6a807cad2f1e3","symbolLocation":24,"imageIndex":0},{"imageOffset":7216900,"symbol":"tokio::runtime::context::set_scheduler::h7abe772a78d054ec","symbolLocation":68,"imageIndex":0},{"imageOffset":7243784,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::h05facbe76a4f0ead","symbolLocation":248,"imageIndex":0},{"imageOffset":7362032,"symbol":"tokio::runtime::context::runtime::enter_runtime::hf2ae95d5c661367a","symbolLocation":188,"imageIndex":0},{"imageOffset":7243440,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::hec7adbb00e77e548","symbolLocation":600,"imageIndex":0},{"imageOffset":7248008,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Launch::launch::_$u7b$$u7b$closure$u7d$$u7d$::hf7c5c2c067f21715","symbolLocation":24,"imageIndex":0},{"imageOffset":7502472,"symbol":"_$LT$tokio..runtime..blocking..task..BlockingTask$LT$T$GT$$u20$as$u20$core..future..future..Future$GT$::poll::h301eb4f01c177b57","symbolLocation":136,"imageIndex":0},{"imageOffset":7545944,"symbol":"tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::_$u7b$$u7b$closure$u7d$$u7d$::h11b6b3f2bd5493eb","symbolLocation":192,"imageIndex":0},{"imageOffset":7545360,"symbol":"tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::h15034e48b9b41ff3","symbolLocation":72,"imageIndex":0},{"imageOffset":7467856,"symbol":"tokio::runtime::task::harness::poll_future::_$u7b$$u7b$closure$u7d$$u7d$::h579c3638846ffa27","symbolLocation":64,"imageIndex":0},{"imageOffset":7515892,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hbc653bab54913889","symbolLocation":44,"imageIndex":0},{"imageOffset":7449828,"symbol":"std::panicking::catch_unwind::do_call::hdc7008e0f0436520","symbolLocation":72,"imageIndex":0},{"imageOffset":7288248,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7269904,"symbol":"std::panic::catch_unwind::h6cb1d6d821f2392e","symbolLocation":96,"imageIndex":0},{"imageOffset":7466724,"symbol":"tokio::runtime::task::harness::poll_future::hadce4168d4e011fe","symbolLocation":96,"imageIndex":0},{"imageOffset":7469072,"symbol":"tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll_inner::h33e5930872acf673","symbolLocation":160,"imageIndex":0},{"imageOffset":7470844,"symbol":"tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll::h6bb0b3451b818ad8","symbolLocation":28,"imageIndex":0},{"imageOffset":7320180,"symbol":"tokio::runtime::task::raw::poll::hd2f2553821cd57d7","symbolLocation":36,"imageIndex":0},{"imageOffset":7321460,"symbol":"tokio::runtime::task::raw::RawTask::poll::h7288203f493b28e0","symbolLocation":52,"imageIndex":0},{"imageOffset":7433316,"symbol":"tokio::runtime::task::UnownedTask$LT$S$GT$::run::hf48fa3ac637b65ee","symbolLocation":64,"imageIndex":0},{"imageOffset":7438508,"symbol":"tokio::runtime::blocking::pool::Task::run::h9767d25d6b73c599","symbolLocation":28,"imageIndex":0},{"imageOffset":7439056,"symbol":"tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a","symbolLocation":536,"imageIndex":0},{"imageOffset":7442872,"symbol":"tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d","symbolLocation":144,"imageIndex":0},{"imageOffset":7310312,"symbol":"std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8","symbolLocation":16,"imageIndex":0},{"imageOffset":7403704,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34","symbolLocation":116,"imageIndex":0},{"imageOffset":7516004,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e","symbolLocation":44,"imageIndex":0},{"imageOffset":7449324,"symbol":"std::panicking::catch_unwind::do_call::h5a186a60818a092e","symbolLocation":68,"imageIndex":0},{"imageOffset":7417468,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7402508,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17","symbolLocation":728,"imageIndex":0},{"imageOffset":7188436,"symbol":"core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39","symbolLocation":24,"imageIndex":0},{"imageOffset":10331396,"symbol":"std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004","symbolLocation":60,"imageIndex":0},{"imageOffset":27592,"symbol":"_pthread_start","symbolLocation":136,"imageIndex":5},{"imageOffset":7040,"symbol":"thread_start","symbolLocation":8,"imageIndex":5}]},{"id":7131880,"name":"tokio-runtime-worker","threadState":{"x":[{"value":260},{"value":0},{"value":1024},{"value":0},{"value":0},{"value":160},{"value":0},{"value":0},{"value":6115643816},{"value":0},{"value":0},{"value":2},{"value":2},{"value":0},{"value":0},{"value":0},{"value":305},{"value":8716440832},{"value":0},{"value":5549472384},{"value":5549472448},{"value":6115651808},{"value":0},{"value":0},{"value":1024},{"value":1025},{"value":1280},{"value":0},{"value":0}],"flavor":"ARM_THREAD_STATE64","lr":{"value":6854262940},"cpsr":{"value":1610616832},"fp":{"value":6115643936},"sp":{"value":6115643792},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6854005708},"far":{"value":0}},"frames":[{"imageOffset":17356,"symbol":"__psynch_cvwait","symbolLocation":8,"imageIndex":4},{"imageOffset":28828,"symbol":"_pthread_cond_wait","symbolLocation":984,"imageIndex":5},{"imageOffset":7516820,"symbol":"std::sys::sync::condvar::pthread::Condvar::wait::h831fd128ae8335c8","symbolLocation":184,"imageIndex":0},{"imageOffset":7503660,"symbol":"std::sync::poison::condvar::Condvar::wait::haa84796d4cc5b740","symbolLocation":56,"imageIndex":0},{"imageOffset":7474796,"symbol":"tokio::runtime::scheduler::multi_thread::park::Inner::park_condvar::hb412d549192a77c4","symbolLocation":284,"imageIndex":0},{"imageOffset":7475636,"symbol":"tokio::runtime::scheduler::multi_thread::park::Inner::park::hfae572ffdf0d9542","symbolLocation":168,"imageIndex":0},{"imageOffset":7476784,"symbol":"tokio::runtime::scheduler::multi_thread::park::Parker::park::h132c6531240678ca","symbolLocation":40,"imageIndex":0},{"imageOffset":7253096,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::park_timeout::h6bae045ee750534d","symbolLocation":776,"imageIndex":0},{"imageOffset":7257248,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::park::h6fd8386b0438fbea","symbolLocation":968,"imageIndex":0},{"imageOffset":7255888,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Context::run::h012098ccf004c898","symbolLocation":1784,"imageIndex":0},{"imageOffset":7244004,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::hec8d0468f2bbe1b0","symbolLocation":104,"imageIndex":0},{"imageOffset":7360624,"symbol":"tokio::runtime::context::scoped::Scoped$LT$T$GT$::set::h8f4f207fb40043e4","symbolLocation":148,"imageIndex":0},{"imageOffset":7217016,"symbol":"tokio::runtime::context::set_scheduler::_$u7b$$u7b$closure$u7d$$u7d$::haf296180a9797e69","symbolLocation":40,"imageIndex":0},{"imageOffset":7292120,"symbol":"std::thread::local::LocalKey$LT$T$GT$::try_with::h791afc483119bd2b","symbolLocation":196,"imageIndex":0},{"imageOffset":7289516,"symbol":"std::thread::local::LocalKey$LT$T$GT$::with::h89f6a807cad2f1e3","symbolLocation":24,"imageIndex":0},{"imageOffset":7216900,"symbol":"tokio::runtime::context::set_scheduler::h7abe772a78d054ec","symbolLocation":68,"imageIndex":0},{"imageOffset":7243784,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::_$u7b$$u7b$closure$u7d$$u7d$::h05facbe76a4f0ead","symbolLocation":248,"imageIndex":0},{"imageOffset":7362032,"symbol":"tokio::runtime::context::runtime::enter_runtime::hf2ae95d5c661367a","symbolLocation":188,"imageIndex":0},{"imageOffset":7243440,"symbol":"tokio::runtime::scheduler::multi_thread::worker::run::hec7adbb00e77e548","symbolLocation":600,"imageIndex":0},{"imageOffset":7248008,"symbol":"tokio::runtime::scheduler::multi_thread::worker::Launch::launch::_$u7b$$u7b$closure$u7d$$u7d$::hf7c5c2c067f21715","symbolLocation":24,"imageIndex":0},{"imageOffset":7502472,"symbol":"_$LT$tokio..runtime..blocking..task..BlockingTask$LT$T$GT$$u20$as$u20$core..future..future..Future$GT$::poll::h301eb4f01c177b57","symbolLocation":136,"imageIndex":0},{"imageOffset":7545944,"symbol":"tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::_$u7b$$u7b$closure$u7d$$u7d$::h11b6b3f2bd5493eb","symbolLocation":192,"imageIndex":0},{"imageOffset":7545360,"symbol":"tokio::runtime::task::core::Core$LT$T$C$S$GT$::poll::h15034e48b9b41ff3","symbolLocation":72,"imageIndex":0},{"imageOffset":7467856,"symbol":"tokio::runtime::task::harness::poll_future::_$u7b$$u7b$closure$u7d$$u7d$::h579c3638846ffa27","symbolLocation":64,"imageIndex":0},{"imageOffset":7515892,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hbc653bab54913889","symbolLocation":44,"imageIndex":0},{"imageOffset":7449828,"symbol":"std::panicking::catch_unwind::do_call::hdc7008e0f0436520","symbolLocation":72,"imageIndex":0},{"imageOffset":7288248,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7269904,"symbol":"std::panic::catch_unwind::h6cb1d6d821f2392e","symbolLocation":96,"imageIndex":0},{"imageOffset":7466724,"symbol":"tokio::runtime::task::harness::poll_future::hadce4168d4e011fe","symbolLocation":96,"imageIndex":0},{"imageOffset":7469072,"symbol":"tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll_inner::h33e5930872acf673","symbolLocation":160,"imageIndex":0},{"imageOffset":7470844,"symbol":"tokio::runtime::task::harness::Harness$LT$T$C$S$GT$::poll::h6bb0b3451b818ad8","symbolLocation":28,"imageIndex":0},{"imageOffset":7320180,"symbol":"tokio::runtime::task::raw::poll::hd2f2553821cd57d7","symbolLocation":36,"imageIndex":0},{"imageOffset":7321460,"symbol":"tokio::runtime::task::raw::RawTask::poll::h7288203f493b28e0","symbolLocation":52,"imageIndex":0},{"imageOffset":7433316,"symbol":"tokio::runtime::task::UnownedTask$LT$S$GT$::run::hf48fa3ac637b65ee","symbolLocation":64,"imageIndex":0},{"imageOffset":7438508,"symbol":"tokio::runtime::blocking::pool::Task::run::h9767d25d6b73c599","symbolLocation":28,"imageIndex":0},{"imageOffset":7439056,"symbol":"tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a","symbolLocation":536,"imageIndex":0},{"imageOffset":7442872,"symbol":"tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d","symbolLocation":144,"imageIndex":0},{"imageOffset":7310312,"symbol":"std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8","symbolLocation":16,"imageIndex":0},{"imageOffset":7403704,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34","symbolLocation":116,"imageIndex":0},{"imageOffset":7516004,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e","symbolLocation":44,"imageIndex":0},{"imageOffset":7449324,"symbol":"std::panicking::catch_unwind::do_call::h5a186a60818a092e","symbolLocation":68,"imageIndex":0},{"imageOffset":7417468,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7402508,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17","symbolLocation":728,"imageIndex":0},{"imageOffset":7188436,"symbol":"core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39","symbolLocation":24,"imageIndex":0},{"imageOffset":10331396,"symbol":"std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004","symbolLocation":60,"imageIndex":0},{"imageOffset":27592,"symbol":"_pthread_start","symbolLocation":136,"imageIndex":5},{"imageOffset":7040,"symbol":"thread_start","symbolLocation":8,"imageIndex":5}]},{"id":7131894,"name":"com.apple.NSEventThread","threadState":{"x":[{"value":0},{"value":21592279046},{"value":8589934592},{"value":213318140690432},{"value":0},{"value":213318140690432},{"value":2},{"value":4294967295},{"value":0},{"value":17179869184},{"value":0},{"value":2},{"value":0},{"value":0},{"value":49667},{"value":0},{"value":18446744073709551569},{"value":8716442712},{"value":0},{"value":4294967295},{"value":2},{"value":213318140690432},{"value":0},{"value":213318140690432},{"value":6116221064},{"value":8589934592},{"value":21592279046},{"value":18446744073709550527},{"value":4412409862}],"flavor":"ARM_THREAD_STATE64","lr":{"value":6854067104},"cpsr":{"value":4096},"fp":{"value":6116220912},"sp":{"value":6116220832},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6853991476},"far":{"value":0}},"frames":[{"imageOffset":3124,"symbol":"mach_msg2_trap","symbolLocation":8,"imageIndex":4},{"imageOffset":78752,"symbol":"mach_msg2_internal","symbolLocation":76,"imageIndex":4},{"imageOffset":38756,"symbol":"mach_msg_overwrite","symbolLocation":484,"imageIndex":4},{"imageOffset":4008,"symbol":"mach_msg","symbolLocation":24,"imageIndex":4},{"imageOffset":510988,"symbol":"__CFRunLoopServiceMachPort","symbolLocation":160,"imageIndex":11},{"imageOffset":505128,"symbol":"__CFRunLoopRun","symbolLocation":1208,"imageIndex":11},{"imageOffset":502248,"symbol":"CFRunLoopRunSpecific","symbolLocation":572,"imageIndex":11},{"imageOffset":1435532,"symbol":"_NSEventThread","symbolLocation":140,"imageIndex":7},{"imageOffset":27592,"symbol":"_pthread_start","symbolLocation":136,"imageIndex":5},{"imageOffset":7040,"symbol":"thread_start","symbolLocation":8,"imageIndex":5}]},{"id":7132038,"name":"tokio-runtime-worker","threadState":{"x":[{"value":260},{"value":0},{"value":77568},{"value":0},{"value":0},{"value":160},{"value":10},{"value":0},{"value":6118941848},{"value":0},{"value":0},{"value":2},{"value":2},{"value":0},{"value":0},{"value":0},{"value":305},{"value":8716440832},{"value":0},{"value":5547377728},{"value":5547396464},{"value":6118944992},{"value":0},{"value":10},{"value":77568},{"value":77569},{"value":77824},{"value":0},{"value":0}],"flavor":"ARM_THREAD_STATE64","lr":{"value":6854262940},"cpsr":{"value":1610616832},"fp":{"value":6118941968},"sp":{"value":6118941824},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6854005708},"far":{"value":0}},"frames":[{"imageOffset":17356,"symbol":"__psynch_cvwait","symbolLocation":8,"imageIndex":4},{"imageOffset":28828,"symbol":"_pthread_cond_wait","symbolLocation":984,"imageIndex":5},{"imageOffset":10386748,"symbol":"std::sys::sync::condvar::pthread::Condvar::wait_timeout::h55fcdfcb7dc8614a","symbolLocation":268,"imageIndex":0},{"imageOffset":7503212,"symbol":"std::sync::poison::condvar::Condvar::wait_timeout::he2f74d08fb615571","symbolLocation":80,"imageIndex":0},{"imageOffset":7439216,"symbol":"tokio::runtime::blocking::pool::Inner::run::hc541e284a627f53a","symbolLocation":696,"imageIndex":0},{"imageOffset":7442872,"symbol":"tokio::runtime::blocking::pool::Spawner::spawn_thread::_$u7b$$u7b$closure$u7d$$u7d$::hffd435559dac3d9d","symbolLocation":144,"imageIndex":0},{"imageOffset":7310312,"symbol":"std::sys::backtrace::__rust_begin_short_backtrace::hd759e1449503f2f8","symbolLocation":16,"imageIndex":0},{"imageOffset":7403704,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::_$u7b$$u7b$closure$u7d$$u7d$::h9d920397488aef34","symbolLocation":116,"imageIndex":0},{"imageOffset":7516004,"symbol":"_$LT$core..panic..unwind_safe..AssertUnwindSafe$LT$F$GT$$u20$as$u20$core..ops..function..FnOnce$LT$$LP$$RP$$GT$$GT$::call_once::hcaf0ff8f34f4ac2e","symbolLocation":44,"imageIndex":0},{"imageOffset":7449324,"symbol":"std::panicking::catch_unwind::do_call::h5a186a60818a092e","symbolLocation":68,"imageIndex":0},{"imageOffset":7417468,"symbol":"__rust_try","symbolLocation":32,"imageIndex":0},{"imageOffset":7402508,"symbol":"std::thread::Builder::spawn_unchecked_::_$u7b$$u7b$closure$u7d$$u7d$::h2fd0e07d790a6e17","symbolLocation":728,"imageIndex":0},{"imageOffset":7188436,"symbol":"core::ops::function::FnOnce::call_once$u7b$$u7b$vtable.shim$u7d$$u7d$::hed514307814beb39","symbolLocation":24,"imageIndex":0},{"imageOffset":10331396,"symbol":"std::sys::thread::unix::Thread::new::thread_start::hceee95ec09c31004","symbolLocation":60,"imageIndex":0},{"imageOffset":27592,"symbol":"_pthread_start","symbolLocation":136,"imageIndex":5},{"imageOffset":7040,"symbol":"thread_start","symbolLocation":8,"imageIndex":5}]},{"id":7205039,"frames":[{"imageOffset":7020,"symbol":"start_wqthread","symbolLocation":0,"imageIndex":5}],"threadState":{"x":[{"value":6092746752},{"value":118503},{"value":6092210176},{"value":6092745600},{"value":5193732},{"value":1},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0}],"flavor":"ARM_THREAD_STATE64","lr":{"value":0},"cpsr":{"value":4096},"fp":{"value":0},"sp":{"value":6092744688},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6854241132},"far":{"value":0}}},{"id":7205280,"frames":[{"imageOffset":7020,"symbol":"start_wqthread","symbolLocation":0,"imageIndex":5}],"threadState":{"x":[{"value":6091599872},{"value":98655},{"value":6091063296},{"value":6091598720},{"value":5193730},{"value":1},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0}],"flavor":"ARM_THREAD_STATE64","lr":{"value":0},"cpsr":{"value":4096},"fp":{"value":0},"sp":{"value":6091598592},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6854241132},"far":{"value":0}}},{"id":7205584,"frames":[{"imageOffset":7020,"symbol":"start_wqthread","symbolLocation":0,"imageIndex":5}],"threadState":{"x":[{"value":6093320192},{"value":121431},{"value":6092783616},{"value":6093319040},{"value":5193734},{"value":1},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0}],"flavor":"ARM_THREAD_STATE64","lr":{"value":0},"cpsr":{"value":4096},"fp":{"value":0},"sp":{"value":6093319024},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6854241132},"far":{"value":0}}},{"id":7205585,"frames":[{"imageOffset":7020,"symbol":"start_wqthread","symbolLocation":0,"imageIndex":5}],"threadState":{"x":[{"value":6094467072},{"value":73259},{"value":6093930496},{"value":6094465920},{"value":5193732},{"value":1},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0}],"flavor":"ARM_THREAD_STATE64","lr":{"value":0},"cpsr":{"value":4096},"fp":{"value":0},"sp":{"value":6094464976},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6854241132},"far":{"value":0}}},{"id":7205586,"frames":[{"imageOffset":7020,"symbol":"start_wqthread","symbolLocation":0,"imageIndex":5}],"threadState":{"x":[{"value":6095040512},{"value":120643},{"value":6094503936},{"value":0},{"value":409604},{"value":18446744073709551615},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0},{"value":0}],"flavor":"ARM_THREAD_STATE64","lr":{"value":0},"cpsr":{"value":4096},"fp":{"value":0},"sp":{"value":6095040512},"esr":{"value":1442840704,"description":" Address size fault"},"pc":{"value":6854241132},"far":{"value":0}}}],
  "usedImages" : [
  {
    "source" : "P",
    "arch" : "arm64",
    "base" : 4375838720,
    "size" : 15876096,
    "uuid" : "9d489cdf-11ad-3077-a386-6321379f73a0",
    "path" : "\/Users\/USER\/Downloads\/*\/FocusTogether",
    "name" : "FocusTogether"
  },
  {
    "source" : "P",
    "arch" : "arm64e",
    "base" : 4672454656,
    "size" : 49152,
    "uuid" : "9a87f143-aa9d-3c46-b2e8-b3fb9215e33e",
    "path" : "\/usr\/lib\/libobjc-trampolines.dylib",
    "name" : "libobjc-trampolines.dylib"
  },
  {
    "source" : "P",
    "arch" : "arm64e",
    "base" : 4700798976,
    "CFBundleShortVersionString" : "329.2",
    "CFBundleIdentifier" : "com.apple.AGXMetalG14G",
    "size" : 7372800,
    "uuid" : "81127308-935a-31e5-89f4-169529f19753",
    "path" : "\/System\/Library\/Extensions\/AGXMetalG14G.bundle\/Contents\/MacOS\/AGXMetalG14G",
    "name" : "AGXMetalG14G",
    "CFBundleVersion" : "329.2"
  },
  {
    "source" : "P",
    "arch" : "arm64e",
    "base" : 4695277568,
    "CFBundleShortVersionString" : "1.0",
    "CFBundleIdentifier" : "com.apple.AppleMetalOpenGLRenderer",
    "size" : 425984,
    "uuid" : "993a7f68-a0cf-32ec-bd84-9a23cd55b5e2",
    "path" : "\/System\/Library\/Extensions\/AppleMetalOpenGLRenderer.bundle\/Contents\/MacOS\/AppleMetalOpenGLRenderer",
    "name" : "AppleMetalOpenGLRenderer",
    "CFBundleVersion" : "1"
  },
  {
    "source" : "P",
    "arch" : "arm64e",
    "base" : 6853988352,
    "size" : 243300,
    "uuid" : "e5d90565-fa1a-3112-b048-59e321191677",
    "path" : "\/usr\/lib\/system\/libsystem_kernel.dylib",
    "name" : "libsystem_kernel.dylib"
  },
  {
    "source" : "P",
    "arch" : "arm64e",
    "base" : 6854234112,
    "size" : 51832,
    "uuid" : "022dc315-cf35-38da-939e-03800b5beff2",
    "path" : "\/usr\/lib\/system\/libsystem_pthread.dylib",
    "name" : "libsystem_pthread.dylib"
  },
  {
    "source" : "P",
    "arch" : "arm64e",
    "base" : 6852755456,
    "size" : 528888,
    "uuid" : "e098cb59-2c56-395c-ade1-6ef590e61199",
    "path" : "\/usr\/lib\/system\/libsystem_c.dylib",
    "name" : "libsystem_c.dylib"
  },
  {
    "source" : "P",
    "arch" : "arm64e",
    "base" : 6921166848,
    "CFBundleShortVersionString" : "6.9",
    "CFBundleIdentifier" : "com.apple.AppKit",
    "size" : 21564704,
    "uuid" : "83f8017f-d50b-38ee-b055-83b7ba6a72d0",
    "path" : "\/System\/Library\/Frameworks\/AppKit.framework\/Versions\/C\/AppKit",
    "name" : "AppKit",
    "CFBundleVersion" : "2575.70.53.1"
  },
  {
    "source" : "P",
    "arch" : "arm64e",
    "base" : 6850428928,
    "size" : 636284,
    "uuid" : "037bb3c1-5c6c-3ec9-af31-f5bded703b36",
    "path" : "\/usr\/lib\/dyld",
    "name" : "dyld"
  },
  {
    "size" : 0,
    "source" : "A",
    "base" : 0,
    "uuid" : "00000000-0000-0000-0000-000000000000"
  },
  {
    "source" : "P",
    "arch" : "arm64e",
    "base" : 7369502720,
    "CFBundleShortVersionString" : "20621",
    "CFBundleIdentifier" : "com.apple.JavaScriptCore",
    "size" : 26237344,
    "uuid" : "5ed49f39-1c6a-3463-85dd-209a905be0fe",
    "path" : "\/System\/Library\/Frameworks\/JavaScriptCore.framework\/Versions\/A\/JavaScriptCore",
    "name" : "JavaScriptCore",
    "CFBundleVersion" : "20621.3.11.11.3"
  },
  {
    "source" : "P",
    "arch" : "arm64e",
    "base" : 6854713344,
    "CFBundleShortVersionString" : "6.9",
    "CFBundleIdentifier" : "com.apple.CoreFoundation",
    "size" : 5500928,
    "uuid" : "63fd96d1-7676-3bc8-a3bf-a13e8c12d902",
    "path" : "\/System\/Library\/Frameworks\/CoreFoundation.framework\/Versions\/A\/CoreFoundation",
    "name" : "CoreFoundation",
    "CFBundleVersion" : "3603.1.401"
  },
  {
    "source" : "P",
    "arch" : "arm64e",
    "base" : 8589615104,
    "CFBundleShortVersionString" : "1.0",
    "CFBundleIdentifier" : "com.apple.DataFrame",
    "size" : 1319499,
    "uuid" : "af9c717f-2220-335a-928a-4c7760641f26",
    "path" : "\/System\/Library\/Frameworks\/TabularData.framework\/Versions\/A\/TabularData",
    "name" : "TabularData"
  }
],
  "sharedCache" : {
  "base" : 6849593344,
  "size" : 5039669248,
  "uuid" : "b395a5f6-c55f-3776-8d60-908ce43d7959"
},
  "legacyInfo" : {
  "threadTriggered" : {
    "name" : "main",
    "queue" : "com.apple.main-thread"
  }
},
  "logWritingSignature" : "e9fc03b3d72671894327b8ff051ca76da155613e",
  "trialInfo" : {
  "rollouts" : [
    {
      "rolloutId" : "6246d6a916a70b047e454124",
      "factorPackIds" : {

      },
      "deploymentId" : 240000010
    },
    {
      "rolloutId" : "64628732bf2f5257dedc8988",
      "factorPackIds" : {

      },
      "deploymentId" : 240000001
    }
  ],
  "experiments" : [

  ]
}
}

Model: Mac14,2, BootROM 13822.41.1, proc 8:4:4 processors, 8 GB, SMC 
Graphics: Apple M2, Apple M2, Built-In
Display: Color LCD, 2560 x 1664 Retina, Main, MirrorOff, Online
Memory Module: LPDDR5, Hynix
AirPort: spairport_wireless_card_type_wifi (0x14E4, 0x4387), wl0: Mar 23 2025 19:56:28 version 20.130.17.0.8.7.197 FWID 01-764e34b7
IO80211_driverkit-1485.12 "IO80211_driverkit-1485.12" Oct  7 2025 20:28:11
AirPort: 
Bluetooth: Version (null), 0 services, 0 devices, 0 incoming serial ports
Network Service: Wi-Fi, AirPort, en0
USB Device: USB31Bus
USB Device: USB31Bus
Thunderbolt Bus: MacBook Air, Apple Inc.
Thunderbolt Bus: MacBook Air, Apple Inc.
